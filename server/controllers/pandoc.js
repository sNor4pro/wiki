const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs-extra')
const _ = require('lodash')

/* global WIKI */

const router = express.Router()

function parseBoolean (value) {
  return _.includes(['1', 'true', 'yes', 'on'], _.toLower(_.toString(value || '')))
}

router.get('/_api/pandoc/config', async (req, res) => {
  if (!_.intersection(req.user.permissions || [], ['write:pages', 'manage:pages', 'manage:system']).length) {
    return res.status(403).json({
      succeeded: false,
      message: 'Du darfst den Dokumentimport nicht verwenden.'
    })
  }

  const config = WIKI.pandoc.getConfig()
  const status = await WIKI.pandoc.refreshStatus({ force: false })

  return res.json({
    succeeded: true,
    config: {
      enabled: config.enabled,
      defaultOutputFormat: config.defaultOutputFormat,
      enableWikiNormalizer: config.enableWikiNormalizer,
      enableAutoTypeDetection: config.enableAutoTypeDetection,
      fallbackReader: config.fallbackReader,
      allowedFileTypes: config.allowedFileTypes,
      maxFileSize: config.maxFileSize,
      showWarnings: config.showWarnings
    },
    status
  })
})

router.post('/_api/pandoc/import', (req, res, next) => {
  const upload = multer({
    dest: path.resolve(WIKI.ROOTPATH, WIKI.config.dataPath, 'uploads'),
    limits: {
      fileSize: _.get(WIKI.config, 'pandocImport.maxFileSize', 10 * 1024 * 1024),
      files: 1
    }
  }).fields([
    { name: 'documentUpload', maxCount: 1 },
    { name: 'document', maxCount: 1 }
  ])

  upload(req, res, err => {
    if (!err) {
      return next()
    }

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        succeeded: false,
        message: 'Die importierte Datei überschreitet die erlaubte Maximalgröße.'
      })
    }

    return res.status(400).json({
      succeeded: false,
      message: 'Die Datei konnte nicht hochgeladen werden.'
    })
  })
}, async (req, res) => {
  const uploadMeta = _.get(req, 'files.documentUpload[0]', _.get(req, 'files.document[0]', null))

  if (!uploadMeta) {
    return res.status(400).json({
      succeeded: false,
      message: 'Es wurde keine Importdatei übergeben.'
    })
  }

  try {
    const result = await WIKI.pandoc.convertImport({
      filePath: uploadMeta.path,
      originalname: uploadMeta.originalname,
      mimetype: uploadMeta.mimetype,
      user: req.user,
      locale: _.get(req, 'body.locale', ''),
      pagePath: _.get(req, 'body.path', '')
    })

    return res.json(result)
  } catch (err) {
    return res.status(_.toInteger(err.status) || 500).json({
      succeeded: false,
      message: _.toString(_.get(err, 'message', 'Der Dokumentimport ist fehlgeschlagen.'))
    })
  } finally {
    try {
      await fs.remove(uploadMeta.path)
    } catch (cleanupErr) {}
  }
})

module.exports = router
