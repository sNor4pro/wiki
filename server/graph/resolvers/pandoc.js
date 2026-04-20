const _ = require('lodash')
const graphHelper = require('../../helpers/graph')

/* global WIKI */

module.exports = {
  Query: {
    async pandocImport () { return {} }
  },
  Mutation: {
    async pandocImport () { return {} }
  },
  PandocImportQuery: {
    async config () {
      return WIKI.pandoc.getConfig()
    },
    async status () {
      return WIKI.pandoc.refreshStatus({ force: true })
    }
  },
  PandocImportMutation: {
    async saveConfig (obj, args) {
      try {
        const conf = args.config || {}
        _.set(WIKI.config, 'pandocImport', {
          enabled: !!conf.enabled,
          defaultOutputFormat: WIKI.pandoc.getOutputFormat(conf.defaultOutputFormat),
          enableWikiNormalizer: conf.enableWikiNormalizer !== false,
          enableAutoTypeDetection: conf.enableAutoTypeDetection !== false,
          fallbackReader: WIKI.pandoc.getFallbackReader(conf.fallbackReader),
          allowedFileTypes: WIKI.pandoc.normalizeAllowedFileTypes(conf.allowedFileTypes),
          maxFileSize: Math.max(1024, _.toSafeInteger(conf.maxFileSize || 10 * 1024 * 1024)),
          showWarnings: conf.showWarnings !== false,
          pandocBinaryPath: WIKI.pandoc.getBinaryPath(conf.pandocBinaryPath)
        })

        await WIKI.configSvc.saveToDb(['pandocImport'])
        await WIKI.pandoc.refreshStatus({ force: true })

        return {
          responseResult: graphHelper.generateSuccess('Pandoc-Import-Konfiguration wurde gespeichert.')
        }
      } catch (err) {
        return graphHelper.generateError(err)
      }
    }
  }
}
