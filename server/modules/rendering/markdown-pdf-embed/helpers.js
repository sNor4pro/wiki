const _ = require('lodash')
const path = require('path')

const DEFAULT_HEIGHT = 720
const DEFAULT_WIDTH = '100%'
const EMBED_CLASS = 'pdf-embed'

function normalizePdfPath(input) {
  if (!_.isString(input)) {
    return null
  }

  const value = input.trim()
  if (!value || value.startsWith('//')) {
    return null
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return null
  }

  const pathOnly = value.replace(/[?#].*$/, '')
  if (!pathOnly.startsWith('/')) {
    return null
  }

  if (pathOnly.includes('\\') || /\s/.test(pathOnly)) {
    return null
  }

  if (!/\.pdf$/i.test(pathOnly)) {
    return null
  }

  return value
}

function isInternalPdfAssetPath(input) {
  return Boolean(normalizePdfPath(input))
}

function buildPdfEmbedMarkup(input, title) {
  const pdfPath = normalizePdfPath(input)
  if (!pdfPath) {
    return ''
  }

  const fileName = path.posix.basename(pdfPath.replace(/[?#].*$/, '')) || 'PDF'
  const iframeTitle = _.escape(title || fileName)
  const safePath = _.escape(pdfPath)

  return [
    `<div class="${EMBED_CLASS}">`,
    `  <iframe src="${safePath}" title="${iframeTitle}" loading="lazy" width="${DEFAULT_WIDTH}" height="${DEFAULT_HEIGHT}" frameborder="0"></iframe>`,
    `  <a href="${safePath}">PDF herunterladen</a>`,
    `</div>`
  ].join('\n')
}

module.exports = {
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  EMBED_CLASS,
  buildPdfEmbedMarkup,
  isInternalPdfAssetPath,
  normalizePdfPath
}
