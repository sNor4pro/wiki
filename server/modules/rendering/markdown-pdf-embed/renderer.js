const _ = require('lodash')
const {
  buildPdfEmbedMarkup,
  normalizePdfPath
} = require('./helpers')

module.exports = {
  init(mdinst) {
    mdinst.block.ruler.before('paragraph', 'pdf_embed', (state, startLine, endLine, silent) => {
      const start = state.bMarks[startLine] + state.tShift[startLine]
      const max = state.eMarks[startLine]

      if (start >= max) {
        return false
      }

      if (state.src.charCodeAt(start) !== 64) {
        return false
      }

      const line = state.src.slice(start, max).trim()
      const match = line.match(/^@\[\s*pdf\s*\]\((.+?)\)\s*$/i)
      if (!match) {
        return false
      }

      if (silent) {
        return true
      }

      const pdfPath = normalizePdfPath(match[1])
      const token = state.push('html_block', '', 0)
      token.block = true
      token.map = [startLine, startLine + 1]
      token.content = pdfPath
        ? buildPdfEmbedMarkup(pdfPath)
        : `<p>${_.escape(line)}</p>`

      state.line = startLine + 1
      return true
    }, {
      alt: ['paragraph', 'reference', 'blockquote', 'list']
    })
  }
}
