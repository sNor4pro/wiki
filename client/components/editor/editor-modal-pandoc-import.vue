<template lang='pug'>
  v-card.editor-modal-pandoc-import.animated.fadeIn(flat, tile)
    v-container.pa-4(fluid, grid-list-lg)
      v-layout(row, wrap)
        v-flex(xs12)
          v-toolbar.radius-7(color='teal darken-2', dark, flat)
            v-icon.mr-3 mdi-file-import-outline
            .subtitle-1 Dokumentimport (Pandoc)
            v-spacer
            v-chip.mr-3(label, small, color='teal lighten-5', text-color='teal darken-3')
              span {{ pipelineLabel }}
            v-btn(icon, dark, @click='close')
              v-icon mdi-close

      v-layout(row, wrap)
        v-flex(lg8, xs12)
          v-card.radius-7(flat, :class='$vuetify.theme.dark ? `grey darken-4` : `grey lighten-5`')
            v-card-text
              .body-2.mb-2 Ziehe eine Datei hierher oder wähle sie aus. Der Inhalt wird serverseitig mit Pandoc nach Markdown konvertiert und danach direkt im Markdown-Editor geöffnet.
              v-alert.mb-4(
                outlined
                dense
                :value='showStatusAlert'
                :color='statusAlertColor'
                :icon='statusAlertIcon'
              )
                .caption {{ statusMessage }}
                .caption.mt-1(v-if='runtimeStatus.version') Pandoc-Version: {{ runtimeStatus.version }}
              v-alert.mb-4(color='teal', outlined, dense, icon='mdi-information', :value='true')
                .caption Erlaubte Typen: {{ allowedTypesLabel }}. Die Konvertierung wird vor dem ersten Speichern im Editor geprüft und kann dort nachbearbeitet werden.
              v-alert.mb-4(
                v-if='selectedFileError'
                outlined
                dense
                type='error'
                icon='mdi-alert-outline'
                :value='true'
              )
                .caption {{ selectedFileError }}

              input.d-none(
                ref='fileInput'
                type='file'
                :accept='acceptAttr'
                @change='onFilePicked'
              )

              .pandoc-dropzone.radius-7(
                :class='{ "is-dragging": isDragging, "has-file": !!selectedFile, "is-disabled": !canSelectFile }'
                @click='browse'
                @dragenter.prevent='isDragging = true'
                @dragover.prevent='isDragging = true'
                @dragleave.prevent='isDragging = false'
                @drop.prevent='onDrop'
              )
                v-icon.mb-3(size='44', color='teal') mdi-cloud-upload-outline
                .body-2.font-weight-medium Datei hier ablegen
                .caption.grey--text(v-if='!selectedFile && canSelectFile') oder auf den Bereich klicken, um den Dateidialog zu öffnen.
                .caption.grey--text(v-else-if='!selectedFile') Import aktuell nicht verfügbar.
                template(v-else)
                  .body-2.mt-2 {{ selectedFile.name }}
                  .caption.grey--text {{ fileDetails }}

              v-row.mt-4(dense)
                v-col(cols='12', md='6')
                  v-text-field(
                    outlined
                    label='Erkannter Typ'
                    :value='detectedTypeLabel'
                    readonly
                    prepend-icon='mdi-file-search-outline'
                    hide-details
                  )
                v-col(cols='12', md='6')
                  v-text-field(
                    outlined
                    label='Reader'
                    :value='selectedReaderLabel'
                    readonly
                    prepend-icon='mdi-code-tags'
                    hide-details
                  )
                v-col(cols='12', md='6')
                  v-text-field(
                    outlined
                    label='Outputformat'
                    :value='selectedWriterDisplay'
                    readonly
                    prepend-icon='mdi-file-document-edit-outline'
                    hide-details
                  )
                v-col(cols='12', md='6')
                  v-text-field(
                    outlined
                    label='Dateigrenze'
                    :value='maxFileSizeLabel'
                    readonly
                    prepend-icon='mdi-weight'
                    hide-details
                  )

        v-flex(lg4, xs12)
          v-card.radius-7(flat, :class='$vuetify.theme.dark ? `grey darken-4` : `grey lighten-5`')
            v-card-text
              .subtitle-2.mb-3 Importbericht
              template(v-if='importReport')
                .caption.grey--text(v-if='importReport.sourceFilename') Datei: {{ importReport.sourceFilename }}
                .caption.grey--text(v-if='importReport.pipeline') Pipeline: {{ importReport.pipeline }}
                .caption.grey--text(v-if='importReport.selectedReader') Reader: {{ importReport.selectedReader }}
                .caption.grey--text(v-if='importReport.selectedWriter') Writer: {{ importReport.selectedWriter }}
                v-divider.my-3
                template(v-if='importWarnings.length > 0')
                  v-alert(v-for='(warning, idx) in importWarnings' :key='`warn-` + idx' outlined dense type='warning')
                    .caption {{ warning }}
                template(v-else)
                  v-alert(outlined dense type='success') Keine Warnungen gemeldet.
              template(v-else)
                .body-2.grey--text Noch kein Import durchgeführt.

            v-card-actions.pa-3
              v-spacer
              v-btn(text, @click='close', :disabled='isUploading') Abbrechen
              v-btn(color='teal', dark, depressed, @click='startImport', :loading='isUploading', :disabled='!canStartImport')
                v-icon(left) mdi-cloud-upload
                span Importieren

    v-dialog(:value='showProgress', persistent, width='420')
      v-card(color='teal darken-2', dark)
        v-card-text.text-center.pa-10
          v-progress-circular.mb-5(indeterminate, size='54', width='4', color='white')
          .body-1 Konvertiere Dokument...
          .caption.mt-2 {{ progressMessage }}
</template>

<script>
import _ from 'lodash'
import Cookies from 'js-cookie'
import { get, sync } from 'vuex-pathify'

const TYPE_EXTENSION_MAP = {
  docx: ['docx'],
  odt: ['odt'],
  html: ['html', 'htm'],
  md: ['md', 'markdown'],
  txt: ['txt'],
  rtf: ['rtf'],
  epub: ['epub']
}

const EXT_READER_MAP = {
  docx: 'docx',
  odt: 'odt',
  html: 'html',
  htm: 'html',
  md: 'markdown',
  markdown: 'markdown',
  txt: 'plain',
  rtf: 'rtf',
  epub: 'epub',
  wiki: 'plain'
}

const DEFAULT_RUNTIME_CONFIG = {
  enabled: true,
  defaultOutputFormat: 'gfm',
  enableWikiNormalizer: true,
  enableAutoTypeDetection: true,
  fallbackReader: 'markdown',
  allowedFileTypes: ['docx', 'odt', 'html', 'md', 'txt'],
  maxFileSize: 10485760,
  showWarnings: true
}

const DEFAULT_RUNTIME_STATUS = {
  isAvailable: false,
  isInstalled: false,
  version: '',
  binaryPath: '',
  statusMessage: ''
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0
  if (value < 1024) {
    return `${value} B`
  }
  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export default {
  data() {
    return {
      isDragging: false,
      isUploading: false,
      progressMessage: 'Datei wird vorbereitet...',
      selectedFile: null,
      importReport: null,
      runtimeConfig: _.cloneDeep(DEFAULT_RUNTIME_CONFIG),
      runtimeStatus: _.cloneDeep(DEFAULT_RUNTIME_STATUS),
      configLoading: false,
      configLoaded: false,
      configError: ''
    }
  },
  computed: {
    activeModal: sync('editor/activeModal'),
    suppressNextPropsModal: sync('editor/suppressNextPropsModal'),
    locale: get('page/locale'),
    path: get('page/path'),
    allowedExtensions() {
      return _.uniq(
        _.flatMap(this.runtimeConfig.allowedFileTypes || [], type => {
          return _.get(TYPE_EXTENSION_MAP, _.toString(type), [])
        })
      )
    },
    canSelectFile() {
      return !this.configLoading &&
        !this.configError &&
        !!this.runtimeConfig.enabled &&
        !!this.runtimeStatus.isInstalled
    },
    canStartImport() {
      return this.canSelectFile && !!this.selectedFile && !this.selectedFileError && !this.isUploading
    },
    showStatusAlert() {
      return this.configLoading || !!this.configError || !this.runtimeConfig.enabled || !this.runtimeStatus.isInstalled
    },
    statusAlertColor() {
      if (this.configLoading) {
        return 'info'
      }
      if (this.configError || !this.runtimeConfig.enabled || !this.runtimeStatus.isInstalled) {
        return 'warning'
      }
      return 'info'
    },
    statusAlertIcon() {
      if (this.configLoading) {
        return 'mdi-timer-sand'
      }
      if (!this.runtimeConfig.enabled) {
        return 'mdi-toggle-switch-off-outline'
      }
      if (!this.runtimeStatus.isInstalled || this.configError) {
        return 'mdi-alert-circle-outline'
      }
      return 'mdi-information-outline'
    },
    statusMessage() {
      if (this.configLoading) {
        return 'Pandoc-Konfiguration wird geladen...'
      }
      if (this.configError) {
        return this.configError
      }
      if (!this.runtimeConfig.enabled) {
        return 'Der Dokumentimport wurde in den Admin-Einstellungen deaktiviert.'
      }
      if (!this.runtimeStatus.isInstalled) {
        return this.runtimeStatus.statusMessage || 'Pandoc ist auf dem Server derzeit nicht verfügbar.'
      }
      return this.runtimeStatus.statusMessage || 'Pandoc ist verfügbar.'
    },
    importWarnings() {
      return _.filter(
        _.map(this.importReport ? _.get(this.importReport, 'warnings', []) : [], w => {
          return _.toString(_.get(w, 'message', w))
        }),
        Boolean
      )
    },
    selectedWriterDisplay() {
      return _.get(this.importReport, 'selectedWriter', _.get(this.$store.get('editor/importMeta'), 'selectedWriter', this.runtimeConfig.defaultOutputFormat || 'gfm'))
    },
    allowedTypesLabel() {
      return this.allowedExtensions.join(', ')
    },
    acceptAttr() {
      return this.allowedExtensions.map(ext => `.${ext}`).join(',')
    },
    pipelineLabel() {
      return this.importReport && this.importReport.pipeline
        ? this.importReport.pipeline
        : `Pandoc -> ${this.selectedWriterDisplay || 'gfm'}${this.runtimeConfig.enableWikiNormalizer ? ' -> Wiki-Normalizer' : ''}`
    },
    detectedTypeLabel() {
      return this.selectedFile ? this.detectFileType(this.selectedFile).label : 'Noch keine Datei gewählt'
    },
    selectedReaderLabel() {
      if (this.importReport && this.importReport.selectedReader) {
        return this.importReport.selectedReader
      }
      return this.selectedFile ? this.detectFileType(this.selectedFile).reader : 'n/a'
    },
    fileDetails() {
      if (!this.selectedFile) {
        return ''
      }
      const detected = this.detectFileType(this.selectedFile)
      return `${detected.label} · ${formatBytes(this.selectedFile.size)} · ${_.toLower(this.selectedFile.type || 'unbekannt')}`
    },
    maxFileSizeBytes() {
      return _.toSafeInteger(this.runtimeConfig.maxFileSize || DEFAULT_RUNTIME_CONFIG.maxFileSize)
    },
    maxFileSizeLabel() {
      return formatBytes(this.maxFileSizeBytes)
    },
    selectedFileError() {
      if (!this.selectedFile) {
        return ''
      }

      const fileName = _.toString(this.selectedFile.name || '')
      const ext = _.toLower(_.trim(_.last(fileName.split('.')) || ''))

      if (!ext || !this.allowedExtensions.includes(ext)) {
        return `Dateityp .${ext || '?'} ist für diesen Import nicht freigegeben.`
      }

      if (this.selectedFile.size > this.maxFileSizeBytes) {
        return `Die Datei ist zu groß. Erlaubt sind maximal ${this.maxFileSizeLabel}.`
      }

      return ''
    },
    showProgress() {
      return this.isUploading
    }
  },
  watch: {
    activeModal(newValue) {
      if (newValue === 'editorModalPandocImport') {
        this.loadRuntimeConfig({ force: true })
      }
    }
  },
  created() {
    this.loadRuntimeConfig()
  },
  methods: {
    buildAuthHeaders() {
      const jwtToken = Cookies.get('jwt')
      return jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}
    },
    close() {
      if (!this.isUploading) {
        this.activeModal = ''
      }
    },
    browse() {
      if (this.canSelectFile && this.$refs.fileInput) {
        this.$refs.fileInput.value = null
        this.$refs.fileInput.click()
      }
    },
    async loadRuntimeConfig({ force = false, silent = false } = {}) {
      if (this.configLoading || (this.configLoaded && !force)) {
        return
      }

      this.configLoading = true
      this.configError = ''

      try {
        const resp = await fetch('/_api/pandoc/config', {
          method: 'GET',
          headers: this.buildAuthHeaders(),
          credentials: 'same-origin'
        })
        const contentType = _.toString(resp.headers.get('content-type'))
        const payload = _.includes(contentType, 'application/json')
          ? await resp.json()
          : { succeeded: false, message: _.trim(await resp.text()) || 'Pandoc-Konfiguration konnte nicht geladen werden.' }

        if (!resp.ok || payload.succeeded === false) {
          throw new Error(_.get(payload, 'message', 'Pandoc-Konfiguration konnte nicht geladen werden.'))
        }

        this.runtimeConfig = Object.assign({}, DEFAULT_RUNTIME_CONFIG, _.get(payload, 'config', {}))
        this.runtimeStatus = Object.assign({}, DEFAULT_RUNTIME_STATUS, _.get(payload, 'status', {}))
        this.configLoaded = true
      } catch (err) {
        this.runtimeConfig = _.cloneDeep(DEFAULT_RUNTIME_CONFIG)
        this.runtimeStatus = _.cloneDeep(DEFAULT_RUNTIME_STATUS)
        this.configError = _.get(err, 'message', 'Pandoc-Konfiguration konnte nicht geladen werden.')
        if (!silent) {
          this.$store.commit('showNotification', {
            message: this.configError,
            style: 'error',
            icon: 'warning'
          })
        }
      } finally {
        this.configLoading = false
      }
    },
    updateSelectedFile(file) {
      this.isDragging = false
      this.importReport = null
      this.selectedFile = file || null

      if (!this.selectedFile) {
        return
      }

      if (this.selectedFileError) {
        this.$store.commit('showNotification', {
          message: this.selectedFileError,
          style: 'warning',
          icon: 'warning'
        })
      }
    },
    onFilePicked(ev) {
      const file = _.get(ev, 'target.files[0]', null)
      this.updateSelectedFile(file)
    },
    onDrop(ev) {
      this.isDragging = false
      if (!this.canSelectFile) {
        return
      }
      const file = _.get(ev, 'dataTransfer.files[0]', null)
      this.updateSelectedFile(file)
    },
    detectFileType(file) {
      if (!file) {
        return {
          ext: '',
          reader: 'n/a',
          label: 'Unbekannt'
        }
      }

      const fileName = _.toString(file.name || '')
      const ext = _.toLower(_.trim(_.last(fileName.split('.')) || ''))
      const mime = _.toLower(_.toString(file.type || ''))
      const reader = _.get(EXT_READER_MAP, ext, '')
      const mimeLabel = mime || 'unbekannt'

      if (ext && reader) {
        return {
          ext,
          reader,
          label: `${ext.toUpperCase()} (${mimeLabel})`
        }
      }

      return {
        ext,
        reader: 'markdown',
        label: mimeLabel
      }
    },
    async startImport() {
      if (!this.selectedFile || this.isUploading) {
        return
      }
      await this.loadRuntimeConfig({ force: true, silent: true })

      if (!this.canStartImport) {
        this.$store.commit('showNotification', {
          message: this.selectedFileError || this.statusMessage,
          style: 'warning',
          icon: 'warning'
        })
        return
      }

      this.isUploading = true
      this.progressMessage = 'Datei wird an den Server gesendet...'

      try {
        const formData = new FormData()
        formData.append('locale', this.locale)
        formData.append('path', this.path)
        formData.append('documentUpload', this.selectedFile, this.selectedFile.name)

        const resp = await fetch('/_api/pandoc/import', {
          method: 'POST',
          headers: this.buildAuthHeaders(),
          credentials: 'same-origin',
          body: formData
        })

        const contentType = _.toString(resp.headers.get('content-type'))
        const payload = _.includes(contentType, 'application/json') ? await resp.json() : { succeeded: false, message: _.trim(await resp.text()) || 'Unbekannte Antwort vom Server.' }

        if (!resp.ok || payload.succeeded === false) {
          throw new Error(_.get(payload, 'message', 'Dokumentimport fehlgeschlagen.'))
        }

        const warnings = _.get(payload, 'warnings', [])
        const importMeta = {
          sourceFilename: _.get(payload, 'sourceFilename', this.selectedFile.name),
          detectedType: _.get(payload, 'detectedType', this.detectFileType(this.selectedFile).ext || 'unknown'),
          detectedMime: _.get(payload, 'detectedMime', this.selectedFile.type || ''),
          selectedReader: _.get(payload, 'selectedReader', this.detectFileType(this.selectedFile).reader),
          selectedWriter: _.get(payload, 'selectedWriter', this.runtimeConfig.defaultOutputFormat || 'gfm'),
          pipeline: _.get(payload, 'pipeline', `Pandoc -> ${_.get(payload, 'selectedWriter', this.runtimeConfig.defaultOutputFormat || 'gfm')}${this.runtimeConfig.enableWikiNormalizer ? ' -> Wiki-Normalizer' : ''}`),
          warnings: _.isArray(warnings) ? warnings : [],
          importedAt: new Date().toISOString()
        }

        this.importReport = importMeta
        this.$store.set('editor/importMeta', importMeta)
        this.$store.set('editor/content', _.toString(_.get(payload, 'content', '')))
        if (_.get(payload, 'suggestedTitle')) {
          this.$store.set('page/title', _.get(payload, 'suggestedTitle'))
        }
        if (_.get(payload, 'suggestedDescription')) {
          this.$store.set('page/description', _.get(payload, 'suggestedDescription'))
        }
        this.suppressNextPropsModal = true
        this.activeModal = ''
        this.$store.set('editor/editor', 'editorMarkdown')
        this.$store.commit('showNotification', {
          message: 'Dokument erfolgreich importiert und im Markdown-Editor geöffnet.',
          style: 'success',
          icon: 'check'
        })
      } catch (err) {
        this.$store.commit('showNotification', {
          message: _.get(err, 'message', 'Dokumentimport fehlgeschlagen.'),
          style: 'error',
          icon: 'warning'
        })
      } finally {
        this.isUploading = false
      }
    }
  }
}
</script>

<style lang='scss'>
.editor-modal-pandoc-import {
  position: fixed !important;
  top: 0;
  left: 0;
  z-index: 10;
  width: 100%;
  height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(13, 148, 136, .25), transparent 35%),
    radial-gradient(circle at bottom right, rgba(20, 184, 166, .18), transparent 30%),
    rgba(12, 18, 20, .94) !important;
  overflow: auto;

  .pandoc-dropzone {
    min-height: 220px;
    border: 2px dashed rgba(13, 148, 136, .55);
    background: rgba(255, 255, 255, .04);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 24px;
    cursor: pointer;
    transition: all .2s ease;

    &.is-dragging {
      border-color: rgba(45, 212, 191, 1);
      background: rgba(45, 212, 191, .10);
      transform: translateY(-2px);
    }

    &.has-file {
      border-style: solid;
      background: rgba(45, 212, 191, .08);
    }

    &.is-disabled {
      cursor: not-allowed;
      opacity: .6;
      border-color: rgba(148, 163, 184, .45);
      background: rgba(148, 163, 184, .06);
      transform: none;
    }
  }

  .d-none {
    display: none;
  }
}
</style>
