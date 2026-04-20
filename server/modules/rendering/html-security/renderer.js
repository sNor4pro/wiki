const { JSDOM } = require('jsdom')
const createDOMPurify = require('dompurify')
const {
  isInternalPdfAssetPath
} = require('../markdown-pdf-embed/helpers')

module.exports = {
  async init(input, config) {
    if (config.safeHTML) {
      const window = new JSDOM('').window
      const DOMPurify = createDOMPurify(window)

      const allowedAttrs = ['v-pre', 'v-slot:tabs', 'v-slot:content', 'target', 'src', 'title', 'loading', 'width', 'height', 'frameborder', 'referrerpolicy']
      const allowedTags = ['tabset', 'template', 'iframe']

      if (config.allowDrawIoUnsafe) {
        allowedTags.push('foreignObject')
        DOMPurify.addHook('uponSanitizeElement', (elm) => {
          if (elm.querySelectorAll) {
            const breaks = elm.querySelectorAll('foreignObject br, foreignObject p')
            if (breaks && breaks.length) {
              for (let i = 0; i < breaks.length; i++) {
                breaks[i].parentNode.replaceChild(
                  window.document.createElement('div'),
                  breaks[i]
                )
              }
            }
          }
        })
      }

      DOMPurify.addHook('uponSanitizeElement', (elm) => {
        if (!elm || !elm.nodeName || elm.nodeName.toLowerCase() !== 'iframe') {
          return
        }

        if (config.allowIFrames) {
          return
        }

        const parent = elm.parentNode
        const isPdfEmbed = Boolean(parent && parent.nodeType === 1 && parent.classList && parent.classList.contains('pdf-embed'))
        const src = elm.getAttribute('src')

        if (!isPdfEmbed || !isInternalPdfAssetPath(src)) {
          if (elm.parentNode) {
            elm.parentNode.removeChild(elm)
          }
        }
      })

      if (config.allowIFrames) {
        allowedAttrs.push('allow')
      }

      input = DOMPurify.sanitize(input, {
        ADD_ATTR: allowedAttrs,
        ADD_TAGS: allowedTags,
        HTML_INTEGRATION_POINTS: { foreignobject: true }
      })
    }
    return input
  }
}
