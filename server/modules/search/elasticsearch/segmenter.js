const _ = require('lodash')
const cheerio = require('cheerio')
const uslug = require('uslug')

function normalizeText(value) {
  return _.trim(_.toString(value || '').replace(/\s+/g, ' '))
}

function stripTags(value) {
  return _.trim(_.toString(value || '').replace(/<[^>]*>/g, ' '))
}

function truncateText(value, max = 180) {
  const text = normalizeText(value)
  if (!text) {
    return ''
  }
  if (text.length <= max) {
    return text
  }
  return `${text.slice(0, max).trim()}…`
}

function buildSegmentDescription(sectionHeading, sectionText) {
  const heading = normalizeText(sectionHeading)
  const preview = truncateText(sectionText || sectionHeading)

  if (!heading) {
    return preview
  }
  if (!preview || preview === heading) {
    return heading
  }
  return `${heading} — ${preview}`
}

function slugifyText(value) {
  const slug = uslug(normalizeText(value))
  return slug || 'section'
}

function extractPlainText(html) {
  const expanded = _.toString(html || '')
    .replace(/<\s*br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|blockquote|pre|table|tr|h[1-6])>/gi, ' ')

  const $ = cheerio.load(expanded, {
    decodeEntities: false
  })
  const body = $('body')
  const source = body.length > 0 ? body : $.root()
  return normalizeText(source.text())
}

function getHeadingState($, node) {
  const text = normalizeText($(node).text())
  return {
    text,
    level: Number.parseInt(node.name.substring(1), 10) || 1,
    anchor: slugifyText(text)
  }
}

function collectListText($, node) {
  const items = []
  $(node).children('li').each((idx, li) => {
    const text = normalizeText($(li).text())
    if (text) {
      items.push(text)
    }
  })
  return items.join('\n')
}

function collectTableText($, node) {
  const rows = []
  $(node).find('tr').each((idx, tr) => {
    const cells = []
    $(tr).children('th,td').each((cellIdx, cell) => {
      const text = normalizeText($(cell).text())
      if (text) {
        cells.push(text)
      }
    })
    const rowText = normalizeText(cells.join(' | '))
    if (rowText) {
      rows.push(rowText)
    }
  })
  return rows.join('\n')
}

function collectBlockText($, node) {
  const tag = node.name.toLowerCase()
  if (tag === 'table') {
    return collectTableText($, node)
  }
  if (tag === 'ul' || tag === 'ol') {
    return collectListText($, node)
  }
  if (tag === 'pre') {
    return normalizeText($(node).text())
  }
  return normalizeText($(node).text())
}

function emitBlock(blocks, headingState, type, text) {
  const normalizedText = normalizeText(text)
  if (!normalizedText) {
    return
  }

  blocks.push({
    type,
    text: normalizedText,
    headingText: headingState ? headingState.text : '',
    headingAnchor: headingState ? headingState.anchor : '',
    headingLevel: headingState ? headingState.level : 0,
    headingKey: headingState ? headingState.anchor : ''
  })
}

function collectBlocks(html) {
  const $ = cheerio.load(_.toString(html || ''), {
    decodeEntities: false
  })
  const body = $('body')
  const source = body.length > 0 ? body : $.root()
  const blocks = []
  let headingState = null

  const visit = node => {
    if (!node || node.type !== 'tag') {
      return
    }

    const tag = node.name.toLowerCase()
    if (['script', 'style', 'noscript'].includes(tag)) {
      return
    }

    if (/^h[1-6]$/.test(tag)) {
      headingState = getHeadingState($, node)
      return
    }

    if (tag === 'ul' || tag === 'ol' || tag === 'table' || tag === 'blockquote' || tag === 'pre' || tag === 'p') {
      emitBlock(blocks, headingState, tag, collectBlockText($, node))
      return
    }

    const childNodes = $(node).contents()
    if (childNodes.length > 0) {
      childNodes.each((idx, child) => visit(child))
      return
    }

    emitBlock(blocks, headingState, 'text', collectBlockText($, node))
  }

  source.contents().each((idx, node) => visit(node))
  return blocks
}

function buildPageSegment(page) {
  const html = _.toString(page.safeContent || page.render || '')
  const plainText = extractPlainText(html)
  const headingMatch = cheerio.load(html, { decodeEntities: false })('h1,h2,h3,h4,h5,h6').first().text()
  const sectionHeading = normalizeText(headingMatch || page.title || '')
  const sectionAnchor = slugifyText(sectionHeading || page.title || page.path || 'page')
  const content = sectionHeading ? `${sectionHeading}\n\n${plainText}` : plainText

  return [{
    id: `page:${page.id}`,
    pageHash: page.hash,
    pageId: page.id,
    pagePath: page.path,
    pageTitle: page.title,
    pageDescription: page.description || '',
    pageTags: page.tags || [],
    locale: page.localeCode,
    contentMode: 'page',
    sectionType: 'page',
    sectionIndex: 0,
    sectionKey: 'page',
    sectionAnchor,
    sectionHeading,
    sectionText: plainText,
    snippetPreview: truncateText(plainText || sectionHeading),
    content,
    title: page.title,
    description: page.description || '',
    path: page.path,
    tags: page.tags || [],
    createdBy: page.creatorId || page.authorId || null,
    updatedAt: page.updatedAt || null,
    isPublished: !!page.isPublished,
  }]
}

function buildParagraphSegments(page) {
  const blocks = collectBlocks(page.safeContent || page.render || '')
  if (blocks.length < 1) {
    return buildPageSegment(page)
  }

  return blocks.map((block, idx) => {
    const sectionHeading = normalizeText(block.headingText || '')
    const sectionText = normalizeText(block.text)
    const content = sectionHeading ? `${sectionHeading}\n\n${sectionText}` : sectionText
    const sectionKey = `${block.headingAnchor || 'section'}-${String(idx + 1).padStart(4, '0')}`

    return {
      id: `section:${page.id}:paragraph:${idx}`,
      pageHash: page.hash,
      pageId: page.id,
      pagePath: page.path,
      pageTitle: page.title,
      pageDescription: page.description || '',
      pageTags: page.tags || [],
      locale: page.localeCode,
      contentMode: 'paragraph',
      sectionType: block.type || 'paragraph',
      sectionIndex: idx,
      sectionKey,
      sectionAnchor: block.headingAnchor || sectionKey,
      sectionHeading,
      sectionText,
      snippetPreview: truncateText(sectionText || sectionHeading),
      content,
      title: page.title,
      description: buildSegmentDescription(sectionHeading, sectionText),
      path: page.path,
      tags: page.tags || [],
      createdBy: page.creatorId || page.authorId || null,
      updatedAt: page.updatedAt || null,
      isPublished: !!page.isPublished,
    }
  })
}

function buildBlockSegments(page) {
  const blocks = collectBlocks(page.safeContent || page.render || '')
  if (blocks.length < 1) {
    return buildPageSegment(page)
  }

  const segments = []
  let currentGroup = null

  const flushGroup = () => {
    if (!currentGroup || currentGroup.blocks.length < 1) {
      currentGroup = null
      return
    }

    const sectionText = normalizeText(currentGroup.blocks.map(block => block.text).join('\n\n'))
    const sectionHeading = normalizeText(currentGroup.headingText || '')
    const sectionKey = `${currentGroup.headingAnchor || 'section'}-${String(segments.length + 1).padStart(4, '0')}`
    const primaryType = currentGroup.blocks.length === 1 ? currentGroup.blocks[0].type : 'section'
    const content = sectionHeading ? `${sectionHeading}\n\n${sectionText}` : sectionText

    segments.push({
      id: `section:${page.id}:block:${segments.length}`,
      pageHash: page.hash,
      pageId: page.id,
      pagePath: page.path,
      pageTitle: page.title,
      pageDescription: page.description || '',
      pageTags: page.tags || [],
      locale: page.localeCode,
      contentMode: 'block',
      sectionType: primaryType,
      sectionIndex: segments.length,
      sectionKey,
      sectionAnchor: currentGroup.headingAnchor || sectionKey,
      sectionHeading,
      sectionText,
      snippetPreview: truncateText(sectionText || sectionHeading),
      content,
      title: page.title,
      description: buildSegmentDescription(sectionHeading, sectionText),
      path: page.path,
      tags: page.tags || [],
      createdBy: page.creatorId || page.authorId || null,
      updatedAt: page.updatedAt || null,
      isPublished: !!page.isPublished,
    })

    currentGroup = null
  }

  blocks.forEach(block => {
    const headingKey = block.headingKey || '__root__'
    if (!currentGroup || currentGroup.headingKey !== headingKey) {
      flushGroup()
      currentGroup = {
        headingKey,
        headingText: block.headingText || '',
        headingAnchor: block.headingAnchor || '',
        blocks: []
      }
    }
    currentGroup.blocks.push(block)
  })

  flushGroup()
  return segments.length > 0 ? segments : buildPageSegment(page)
}

function buildSearchDocuments(page, granularityMode = 'page') {
  const mode = ['page', 'paragraph', 'block'].includes(granularityMode) ? granularityMode : 'page'

  switch (mode) {
    case 'paragraph':
      return buildParagraphSegments(page)
    case 'block':
      return buildBlockSegments(page)
    default:
      return buildPageSegment(page)
  }
}

module.exports = {
  buildSearchDocuments,
  collectBlocks,
  extractPlainText,
  normalizeText,
  stripTags,
  slugifyText,
  truncateText
}
