const _ = require('lodash')
const fs = require('fs')
const { pipeline } = require('node:stream/promises')
const { Transform } = require('node:stream')

const {
  buildSearchDocuments,
  normalizeText,
  stripTags,
  truncateText
} = require('./segmenter')

/* global WIKI */

function isApiVersion8(conf) {
  return _.includes(['8.x', '9.x'], _.get(conf, 'apiVersion', '7.x'))
}

function hitPathForVersion(conf) {
  return isApiVersion8(conf) ? 'hits.hits' : 'body.hits.hits'
}

function totalPathForVersion(conf) {
  return isApiVersion8(conf) ? 'hits.total.value' : 'body.hits.total.value'
}

function fallbackTotalPathForVersion(conf) {
  return isApiVersion8(conf) ? 'hits.total' : 'body.hits.total'
}

function suggestionsPathForVersion(conf) {
  return isApiVersion8(conf) ? 'suggest.suggestions' : 'body.suggest.suggestions'
}

function buildIndexProperties() {
  return {
    suggest: { type: 'completion' },
    title: { type: 'text' },
    description: { type: 'text' },
    content: { type: 'text' },
    locale: { type: 'keyword' },
    path: { type: 'text' },
    tags: { type: 'text' },
    pageHash: { type: 'keyword' },
    pageId: { type: 'integer' },
    pagePath: { type: 'keyword' },
    pageTitle: { type: 'text' },
    pageDescription: { type: 'text' },
    pageTags: { type: 'text' },
    contentMode: { type: 'keyword' },
    sectionType: { type: 'keyword' },
    sectionIndex: { type: 'integer' },
    sectionKey: { type: 'keyword' },
    sectionAnchor: { type: 'keyword' },
    sectionHeading: { type: 'text' },
    sectionText: { type: 'text' },
    snippetPreview: { type: 'text' },
    createdBy: { type: 'integer' },
    updatedAt: { type: 'date' },
    isPublished: { type: 'boolean' }
  }
}

function buildIndexBody(conf) {
  const body = {
    properties: buildIndexProperties()
  }

  const settings = {
    analysis: {
      analyzer: {
        default: {
          type: conf.analyzer
        }
      }
    }
  }

  if (conf.apiVersion === '6.x') {
    return {
      mappings: {
        _doc: body
      },
      settings
    }
  }

  return {
    mappings: body,
    settings
  }
}

function createBulkIndexer(engine, refresh = true) {
  const MAX_INDEXING_BYTES = 10 * Math.pow(2, 20) - Buffer.from('[').byteLength - Buffer.from(']').byteLength
  const MAX_INDEXING_COUNT = 1000
  const COMMA_BYTES = Buffer.from(',').byteLength

  let chunks = []
  let bytes = 0

  const flushBuffer = async () => {
    if (chunks.length < 1) {
      return
    }

    WIKI.logger.info(`(SEARCH/ELASTICSEARCH) Sending batch of ${chunks.length}...`)
    try {
      await engine.client.bulk({
        index: engine.config.indexName,
        body: _.reduce(chunks, (result, doc) => {
          result.push({
            index: {
              _index: engine.config.indexName,
              _id: doc.id,
              ...(engine.config.apiVersion !== '8.x' && { _type: '_doc' })
            }
          })
          result.push({
            suggest: doc.suggest,
            tags: doc.tags,
            locale: doc.locale,
            path: doc.path,
            title: doc.title,
            description: doc.description,
            content: doc.content,
            pageHash: doc.pageHash,
            pageId: doc.pageId,
            pagePath: doc.pagePath,
            pageTitle: doc.pageTitle,
            pageDescription: doc.pageDescription,
            pageTags: doc.pageTags,
            contentMode: doc.contentMode,
            sectionType: doc.sectionType,
            sectionIndex: doc.sectionIndex,
            sectionKey: doc.sectionKey,
            sectionAnchor: doc.sectionAnchor,
            sectionHeading: doc.sectionHeading,
            sectionText: doc.sectionText,
            snippetPreview: doc.snippetPreview,
            createdBy: doc.createdBy,
            updatedAt: doc.updatedAt,
            isPublished: doc.isPublished
          })
          return result
        }, []),
        refresh
      })
    } catch (err) {
      WIKI.logger.warn('(SEARCH/ELASTICSEARCH) Failed to send batch to elasticsearch: ', err)
    }
    chunks = []
    bytes = 0
  }

  return {
    async enqueue(documents) {
      for (const doc of _.castArray(documents)) {
        if (!doc) {
          continue
        }

        const docBytes = Buffer.from(JSON.stringify(doc)).byteLength
        if (docBytes + COMMA_BYTES + bytes >= MAX_INDEXING_BYTES || chunks.length >= MAX_INDEXING_COUNT) {
          await flushBuffer()
        }

        if (chunks.length > 0) {
          bytes += COMMA_BYTES
        }
        chunks.push(doc)
        bytes += docBytes
      }
    },
    flush: flushBuffer
  }
}

function getSearchResultDescription(source, hit) {
  const highlight = _.get(hit, 'highlight.sectionText[0]')
    || _.get(hit, 'highlight.content[0]')
    || _.get(hit, 'highlight.sectionHeading[0]')

  if (source.contentMode && source.contentMode !== 'page') {
    const sectionHeading = normalizeText(source.sectionHeading || '')
    const preview = truncateText(stripTags(highlight || source.snippetPreview || source.sectionText || source.description || source.pageDescription || ''))
    if (sectionHeading && preview) {
      return `${sectionHeading} — ${preview}`
    }
    return sectionHeading || preview || source.description || source.pageDescription || ''
  }

  return normalizeText(stripTags(source.description || source.pageDescription || source.snippetPreview || highlight || ''))
}

function getSearchResultTags(source) {
  return _.castArray(source.tags || source.pageTags || []).filter(Boolean)
}

module.exports = {
  async activate() {
    // not used
  },
  async deactivate() {
    // not used
  },
  /**
   * INIT
   */
  async init() {
    WIKI.logger.info(`(SEARCH/ELASTICSEARCH) Initializing...`)
    switch (this.config.apiVersion) {
      case '9.x':
      case '8.x':
        {
          const { Client: Client8 } = require('elasticsearch8')
          this.client = new Client8({
            nodes: this.config.hosts.split(',').map(_.trim),
            sniffOnStart: this.config.sniffOnStart,
            sniffInterval: (this.config.sniffInterval > 0) ? this.config.sniffInterval : false,
            tls: getTlsOptions(this.config),
            name: 'wiki-js'
          })
        }
        break
      case '7.x':
        {
          const { Client: Client7 } = require('elasticsearch7')
          this.client = new Client7({
            nodes: this.config.hosts.split(',').map(_.trim),
            sniffOnStart: this.config.sniffOnStart,
            sniffInterval: (this.config.sniffInterval > 0) ? this.config.sniffInterval : false,
            ssl: getTlsOptions(this.config),
            name: 'wiki-js'
          })
        }
        break
      case '6.x':
        {
          const { Client: Client6 } = require('elasticsearch6')
          this.client = new Client6({
            nodes: this.config.hosts.split(',').map(_.trim),
            sniffOnStart: this.config.sniffOnStart,
            sniffInterval: (this.config.sniffInterval > 0) ? this.config.sniffInterval : false,
            ssl: getTlsOptions(this.config),
            name: 'wiki-js'
          })
        }
        break
      default:
        throw new Error('Unsupported version of elasticsearch! Update your settings in the Administration Area.')
    }

    await this.createIndex()

    WIKI.logger.info(`(SEARCH/ELASTICSEARCH) Initialization completed.`)
  },
  /**
   * Create Index
   */
  async createIndex() {
    try {
      const indexExists = await this.client.indices.exists({ index: this.config.indexName })
      const indexMissing = isApiVersion8(this.config) ? !indexExists : !_.get(indexExists, 'body', false)

      if (indexMissing) {
        WIKI.logger.info(`(SEARCH/ELASTICSEARCH) Creating index...`)
        try {
          await this.client.indices.create({
            index: this.config.indexName,
            body: buildIndexBody(this.config)
          })
        } catch (err) {
          WIKI.logger.error(`(SEARCH/ELASTICSEARCH) Create Index Error: `, _.get(err, 'meta.body.error', err))
        }
      }
    } catch (err) {
      WIKI.logger.error(`(SEARCH/ELASTICSEARCH) Index Check Error: `, _.get(err, 'meta.body.error', err))
    }
  },
  /**
   * QUERY
   *
   * @param {String} q Query
   * @param {Object} opts Additional options
   */
  async query(q, opts) {
    try {
      const searchQuery = {
        bool: {
          must: [
            {
              simple_query_string: {
                query: `*${q}*`,
                fields: [
                  'title^20',
                  'pageTitle^20',
                  'description^5',
                  'pageDescription^5',
                  'tags^8',
                  'pageTags^8',
                  'content^1',
                  'sectionHeading^12',
                  'sectionText^1'
                ],
                default_operator: 'and',
                analyze_wildcard: true
              }
            }
          ]
        }
      }

      if (opts.locale) {
        searchQuery.bool.filter = searchQuery.bool.filter || []
        searchQuery.bool.filter.push({
          term: { locale: opts.locale }
        })
      }

      if (opts.path) {
        searchQuery.bool.filter = searchQuery.bool.filter || []
        searchQuery.bool.filter.push({
          prefix: { pagePath: opts.path }
        })
      }

      const results = await this.client.search({
        index: this.config.indexName,
        body: {
          query: searchQuery,
          from: 0,
          size: 50,
          _source: [
            'title',
            'description',
            'path',
            'locale',
            'tags',
            'pageTags',
            'pageHash',
            'pageId',
            'pagePath',
            'pageTitle',
            'pageDescription',
            'contentMode',
            'sectionType',
            'sectionIndex',
            'sectionKey',
            'sectionAnchor',
            'sectionHeading',
            'sectionText',
            'snippetPreview'
          ],
          highlight: {
            pre_tags: ['<mark>'],
            post_tags: ['</mark>'],
            fields: {
              content: {
                number_of_fragments: 1,
                fragment_size: 200
              },
              sectionText: {
                number_of_fragments: 1,
                fragment_size: 200
              },
              sectionHeading: {
                number_of_fragments: 1,
                fragment_size: 200
              }
            }
          },
          suggest: {
            suggestions: {
              text: q,
              completion: {
                field: 'suggest',
                size: 5,
                skip_duplicates: true,
                fuzzy: true
              }
            }
          }
        }
      })

      const hitPath = hitPathForVersion(this.config)
      const totalPath = totalPathForVersion(this.config)
      const fallbackTotalPath = fallbackTotalPathForVersion(this.config)
      const hits = _.get(results, hitPath, [])

      return {
        results: hits.map(r => {
          const source = _.get(r, '_source', {})
          const description = getSearchResultDescription(source, r)
          const tags = getSearchResultTags(source)
          return {
            id: r._id,
            locale: source.locale,
            path: source.path || source.pagePath,
            title: source.title || source.pageTitle,
            description,
            tags,
            pageId: source.pageId,
            pageHash: source.pageHash,
            pagePath: source.pagePath,
            pageTitle: source.pageTitle,
            pageDescription: source.pageDescription,
            contentMode: source.contentMode,
            sectionType: source.sectionType,
            sectionIndex: source.sectionIndex,
            sectionKey: source.sectionKey,
            sectionAnchor: source.sectionAnchor,
            sectionHeading: source.sectionHeading,
            sectionText: source.sectionText,
            snippetPreview: source.snippetPreview
          }
        }),
        suggestions: _.reject(_.get(results, suggestionsPathForVersion(this.config), []).map(s => _.get(s, 'options[0].text', false)), s => !s),
        totalHits: _.get(results, totalPath, _.get(results, fallbackTotalPath, 0))
      }
    } catch (err) {
      WIKI.logger.warn('Search Engine Error: ', _.get(err, 'meta.body.error', err))
    }
  },

  /**
   * Build tags field
   * @param id
   * @returns {Promise<*|*[]>}
   */
  async buildTags(id) {
    const tags = await WIKI.models.pages.query().findById(id).select('*').withGraphJoined('tags')
    return (tags.tags && tags.tags.length > 0) ? tags.tags.map(function (tag) {
      return tag.title
    }) : []
  },
  /**
   * Build suggest field
   */
  buildSuggest(page) {
    const tokens = []
    const pushTokens = (text, weight) => {
      stripTags(text)
        .split(/\s+/)
        .map(t => normalizeText(t))
        .filter(Boolean)
        .forEach(input => {
          tokens.push({ input, weight })
        })
    }

    pushTokens(page.title, 10)
    pushTokens(page.description, 3)
    pushTokens(page.sectionHeading, 6)
    pushTokens(page.snippetPreview, 2)
    pushTokens(page.safeContent || page.content, 1)

    return _.uniqBy(tokens, 'input')
  },
  async clearPageIndex(pageId, pageHash) {
    if (!pageId && !pageHash) {
      return
    }

    try {
      await this.client.deleteByQuery({
        index: this.config.indexName,
        body: {
          query: {
            bool: {
              should: _.compact([
                pageId ? { term: { pageId } } : null,
                pageHash ? { term: { pageHash } } : null
              ]),
              minimum_should_match: 1
            }
          }
        },
        refresh: true,
        conflicts: 'proceed'
      })
    } catch (err) {
      const errorType = _.get(err, 'meta.body.error.type')
      if (errorType !== 'index_not_found_exception' && errorType !== 'not_found') {
        WIKI.logger.warn('(SEARCH/ELASTICSEARCH) Failed to delete page documents from index: ', _.get(err, 'meta.body.error', err))
      }
    }
  },
  async indexPage(page, options = {}) {
    const granularityMode = _.get(this.config, 'granularityMode', 'page')
    const pageHash = options.pageHash || page.hash
    const pageDoc = {
      ...page,
      hash: pageHash,
      safeContent: page.safeContent || page.render || '',
      tags: page.tags || await this.buildTags(page.id)
    }

    if (options.clearExisting !== false) {
      await this.clearPageIndex(options.previousPageId || page.id, options.previousHash || page.hash)
    }

    const documents = buildSearchDocuments(pageDoc, granularityMode)
    const indexer = createBulkIndexer(this, true)
    await indexer.enqueue(documents)
    await indexer.flush()
  },
  /**
   * CREATE
   *
   * @param {Object} page Page to create
   */
  async created(page) {
    await this.indexPage(page)
  },
  /**
   * UPDATE
   *
   * @param {Object} page Page to update
   */
  async updated(page) {
    await this.indexPage(page)
  },
  /**
   * DELETE
   *
   * @param {Object} page Page to delete
   */
  async deleted(page) {
    await this.clearPageIndex(page.id, page.hash)
  },
  /**
   * RENAME
   *
   * @param {Object} page Page to rename
   */
  async renamed(page) {
    await this.clearPageIndex(page.id, page.hash)

    await this.indexPage({
      ...page,
      hash: page.destinationHash,
      localeCode: page.destinationLocaleCode,
      path: page.destinationPath,
      title: page.title,
      safeContent: page.safeContent || ''
    }, {
      clearExisting: false,
      pageHash: page.destinationHash
    })
  },
  /**
   * REBUILD INDEX
   */
  async rebuild() {
    WIKI.logger.info(`(SEARCH/ELASTICSEARCH) Rebuilding Index...`)
    await this.client.indices.delete({ index: this.config.indexName })
    await this.createIndex()

    const indexer = createBulkIndexer(this, false)

    await pipeline(
      WIKI.models.knex
        .column(
          { id: 'hash' },
          'path',
          { locale: 'localeCode' },
          'title',
          'description',
          'render',
          { realId: 'id' },
          'authorId',
          'creatorId',
          'updatedAt',
          'isPublished'
        )
        .select()
        .from('pages')
        .where({
          isPublished: true,
          isPrivate: false
        })
        .stream(),
      new Transform({
        objectMode: true,
        transform: async (chunk, enc, cb) => {
          try {
            const page = {
              ...chunk,
              id: chunk.realId,
              hash: chunk.id,
              localeCode: chunk.locale,
              safeContent: WIKI.models.pages.cleanHTML(chunk.render),
              tags: await this.buildTags(chunk.realId)
            }
            await indexer.enqueue(buildSearchDocuments(page, _.get(this.config, 'granularityMode', 'page')))
            cb()
          } catch (err) {
            cb(err)
          }
        },
        flush: async cb => {
          try {
            await indexer.flush()
            cb()
          } catch (err) {
            cb(err)
          }
        }
      })
    )

    await this.client.indices.refresh({ index: this.config.indexName })

    WIKI.logger.info(`(SEARCH/ELASTICSEARCH) Index rebuilt successfully.`)
  }
}

function getTlsOptions(conf) {
  if (!conf.tlsCertPath) {
    return {
      rejectUnauthorized: conf.verifyTLSCertificate
    }
  }

  const caList = []
  if (conf.verifyTLSCertificate) {
    caList.push(fs.readFileSync(conf.tlsCertPath))
  }

  return {
    rejectUnauthorized: conf.verifyTLSCertificate,
    ca: caList
  }
}
