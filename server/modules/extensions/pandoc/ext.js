const os = require('os')

/* global WIKI */

module.exports = {
  key: 'pandoc',
  title: 'Pandoc',
  description: 'Convert between markup formats. Required for converting from other formats such as MediaWiki, AsciiDoc, Textile and other wikis.',
  async isCompatible () {
    return ['x64', 'arm64'].includes(os.arch())
  },
  isInstalled: false,
  version: '',
  binaryPath: 'pandoc',
  async check () {
    if (WIKI.pandoc) {
      const status = await WIKI.pandoc.refreshStatus({ force: true })
      this.isInstalled = status.isInstalled
      this.version = status.version
      this.binaryPath = status.binaryPath
    } else {
      this.isInstalled = false
      this.version = ''
      this.binaryPath = 'pandoc'
    }
    return this.isInstalled
  }
}
