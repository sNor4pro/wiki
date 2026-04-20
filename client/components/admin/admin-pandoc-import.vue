<template lang='pug'>
  v-container(fluid, grid-list-lg)
    v-layout(row, wrap)
      v-flex(xs12)
        .admin-header
          img.animated.fadeInUp(src='/_assets/svg/icon-software.svg', alt='Pandoc Import', style='width: 80px;')
          .admin-header-title
            .headline.primary--text.animated.fadeInLeft Pandoc Import
            .subtitle-1.grey--text.animated.fadeInLeft.wait-p2s Verwalte den serverseitigen Dokumentimport und die Markdown-Pipeline fuer Pandoc.
          v-spacer
          v-btn.mr-3.animated.fadeInDown.wait-p2s(icon, outlined, color='grey', @click='refresh')
            v-icon mdi-refresh
          v-btn.animated.fadeInDown(color='success', depressed, large, @click='save')
            v-icon(left) mdi-check
            span {{ $t('common:actions.apply') }}

      v-flex(lg5, xs12)
        v-card.animated.fadeInUp
          v-toolbar(flat, color='primary', dark, dense)
            .subtitle-1 Status
          v-card-text
            v-alert(outlined, :value='true', :color='statusColor', :icon='statusIcon')
              .body-2 {{ status.statusMessage || 'Pandoc-Status konnte nicht geladen werden.' }}
              .caption.mt-2(v-if='status.isInstalled')
                | Installierte Version: {{ status.version || 'unbekannt' }}
              .caption.mt-1(v-if='status.binaryPath')
                | Binary: {{ status.binaryPath }}
              .caption.mt-1(v-if='!status.isInstalled')
                | Der Import ist erst verfuegbar, wenn ein Pandoc-Binary ueber den Serverpfad oder den projektlokalen Managed-Binary verfuegbar ist.
            v-divider.my-4
            .subtitle-2.mb-2 Pipeline
            v-chip(color='primary', label, small) Pandoc
            v-icon.mx-2(color='grey') mdi-arrow-right
            v-chip(color='indigo', label, small) {{ config.defaultOutputFormat || 'gfm' }}
            v-icon.mx-2(color='grey') mdi-arrow-right
            v-chip(:color='config.enableWikiNormalizer ? `teal` : `grey`', label, small, dark)
              | {{ config.enableWikiNormalizer ? 'Wiki-Normalizer' : 'Direktausgabe' }}
            .caption.mt-3.grey--text
              | Die Pipeline ist bewusst abgeleitet und kein eigenes Speicherfeld. Sie folgt dem gewaehlten Markdown-Outputformat und der optionalen Normalisierung.
            v-divider.my-4
            .subtitle-2.mb-2 Hinweise
            .body-2.mb-2
              | Pandoc kann Dokumente konvertieren, wenn ein Server-Binary erreichbar ist oder der projektlokale Managed-Binary automatisch eingerichtet werden konnte.
            .body-2
              | Aendere das Standard-Outputformat oder die Reader-Einstellungen nur zusammen mit einem Rebuild-Test im Zielsystem.

      v-flex(lg7, xs12)
        v-card.animated.fadeInUp.wait-p2s
          v-toolbar(flat, color='primary', dark, dense)
            .subtitle-1 Grundeinstellungen
          v-card-text
            v-switch(
              v-model='config.enabled'
              inset
              color='primary'
              label='Pandoc Import aktivieren'
              persistent-hint
              hint='Aktiviert oder deaktiviert den Dokumentimport ueber Pandoc systemweit.'
            )
            v-layout(row, wrap)
              v-flex(md6, xs12)
                v-select(
                  v-model='config.defaultOutputFormat'
                  :items='outputFormats'
                  outlined
                  label='Standard-Markdown-Outputformat'
                  persistent-hint
                  hint='Definiert, in welches Markdown-Zielformat Pandoc standardmaessig konvertiert.'
                )
              v-flex(md6, xs12)
                v-select(
                  v-model='config.fallbackReader'
                  :items='fallbackReaders'
                  outlined
                  label='Fallback-Reader'
                  persistent-hint
                  hint='Reader fuer Dateien, die sich nicht sicher erkennen lassen.'
                )
            v-layout(row, wrap)
              v-flex(md6, xs12)
                v-switch(
                  v-model='config.enableWikiNormalizer'
                  inset
                  color='primary'
                  label='Wiki-interne Nachbearbeitung aktiv'
                  persistent-hint
                  hint='Fuehrt nach der Pandoc-Konvertierung eine Normalisierung auf Wiki-kompatibles Markdown durch.'
                )
              v-flex(md6, xs12)
                v-switch(
                  v-model='config.enableAutoTypeDetection'
                  inset
                  color='primary'
                  label='Automatische Typ-Erkennung aktiv'
                  persistent-hint
                  hint='Bestimmt das Eingabeformat anhand von MIME-Type und Dateiendung.'
                )
            v-layout(row, wrap)
              v-flex(md6, xs12)
                v-text-field(
                  v-model='config.maxFileSize'
                  type='number'
                  min='1'
                  step='1'
                  outlined
                  label='Maximale Dateigroesse (Bytes)'
                  persistent-hint
                  hint='Maximale Groesse fuer importierte Dokumente.'
                )
                .caption.mt-n2.mb-4.pl-9.grey--text Erlaubt aktuell bis zu {{ readableMaxFileSize }} pro Datei.
              v-flex(md6, xs12)
                v-text-field(
                  v-model='config.pandocBinaryPath'
                  outlined
                  label='Pandoc Binary Path'
                  persistent-hint
                  hint='Optionaler Pfad zum bevorzugten Pandoc-Binary. Standard ist `pandoc`; fehlt dieser, wird der projektlokale Managed-Binary versucht.'
                )
            v-combobox(
              v-model='config.allowedFileTypes'
              multiple
              chips
              deletable-chips
              outlined
              label='Erlaubte Dateitypen'
              persistent-hint
              hint='Dateitypen, die Pandoc-Importsystemweit akzeptiert.'
            )
            v-switch(
              v-model='config.showWarnings'
              inset
              color='primary'
              label='Import-Warnungen anzeigen'
              persistent-hint
              hint='Zeigt dem Nutzer nach der Konvertierung Warnungen ueber problematische oder nicht verlustfrei konvertierbare Inhalte an.'
            )
            v-alert.mt-4(outlined, type='info', dense, :value='true')
              .body-2
                | Vor dem ersten Speichern sollte der Import im Markdown-Editor kontrolliert werden. Das Admin-Feature steuert die Pipeline, nicht die eigentliche Seitenfreigabe.
              .caption.mt-2
                | Hinweise wie Versionsstand, Reader-Auswahl und Problemstellen sollten im Import-Dialog angezeigt werden.
</template>

<script>
import _ from 'lodash'
import filesize from 'filesize'

import pandocConfigQuery from 'gql/admin/pandoc/pandoc-query-config.gql'
import pandocStatusQuery from 'gql/admin/pandoc/pandoc-query-status.gql'
import pandocSaveMutation from 'gql/admin/pandoc/pandoc-mutation-save-config.gql'

export default {
  data () {
    return {
      config: {
        enabled: true,
        defaultOutputFormat: 'gfm',
        enableWikiNormalizer: true,
        enableAutoTypeDetection: true,
        fallbackReader: 'markdown',
        allowedFileTypes: ['docx', 'odt', 'html', 'md', 'txt'],
        maxFileSize: 10485760,
        showWarnings: true,
        pandocBinaryPath: 'pandoc'
      },
      status: {
        isInstalled: false,
        version: '',
        binaryPath: '',
        statusMessage: ''
      },
      outputFormats: [
        { text: 'GitHub Flavored Markdown (gfm)', value: 'gfm' },
        { text: 'CommonMark', value: 'commonmark' },
        { text: 'CommonMark + Extensions (commonmark_x)', value: 'commonmark_x' },
        { text: 'Pandoc Markdown', value: 'markdown' }
      ],
      fallbackReaders: [
        { text: 'Markdown', value: 'markdown' },
        { text: 'CommonMark + Extensions', value: 'commonmark_x' },
        { text: 'HTML', value: 'html' },
        { text: 'Plain Text', value: 'plain' }
      ]
    }
  },
  computed: {
    statusColor () {
      if (this.status.isInstalled) {
        return 'success'
      }
      return 'warning'
    },
    statusIcon () {
      return this.status.isInstalled ? 'mdi-check-circle-outline' : 'mdi-alert-circle-outline'
    },
    readableMaxFileSize () {
      try {
        return filesize(this.config.maxFileSize || 0)
      } catch (err) {
        return `${this.config.maxFileSize || 0} bytes`
      }
    }
  },
  methods: {
    normalizeAllowedFileTypes () {
      this.config.allowedFileTypes = _.uniq(
        _.filter(
          _.map(
            _.castArray(this.config.allowedFileTypes),
            v => _.toString(v).trim().toLowerCase()
          ),
          Boolean
        )
      )
    },
    async refresh () {
      await this.$apollo.queries.config.refetch()
      await this.$apollo.queries.status.refetch()
      this.$store.commit('showNotification', {
        message: 'Pandoc-Status und Konfiguration wurden neu geladen.',
        style: 'success',
        icon: 'cached'
      })
    },
    async save () {
      this.normalizeAllowedFileTypes()
      this.$store.commit('loadingStart', 'admin-pandoc-import-save')
      try {
        const resp = await this.$apollo.mutate({
          mutation: pandocSaveMutation,
          variables: {
            config: {
              enabled: !!this.config.enabled,
              defaultOutputFormat: _.toString(this.config.defaultOutputFormat || 'gfm'),
              enableWikiNormalizer: !!this.config.enableWikiNormalizer,
              enableAutoTypeDetection: !!this.config.enableAutoTypeDetection,
              fallbackReader: _.toString(this.config.fallbackReader || 'markdown'),
              allowedFileTypes: this.config.allowedFileTypes,
              maxFileSize: _.toSafeInteger(this.config.maxFileSize || 0),
              showWarnings: !!this.config.showWarnings,
              pandocBinaryPath: _.toString(this.config.pandocBinaryPath || 'pandoc')
            }
          }
        })
        if (_.get(resp, 'data.pandocImport.saveConfig.responseResult.succeeded', false)) {
          this.$store.commit('showNotification', {
            message: 'Pandoc Import wurde erfolgreich gespeichert.',
            style: 'success',
            icon: 'check'
          })
          await this.refresh()
        } else {
          throw new Error(_.get(resp, 'data.pandocImport.saveConfig.responseResult.message', 'Pandoc Import konnte nicht gespeichert werden.'))
        }
      } catch (err) {
        this.$store.commit('pushGraphError', err)
      }
      this.$store.commit('loadingStop', 'admin-pandoc-import-save')
    }
  },
  apollo: {
    config: {
      query: pandocConfigQuery,
      fetchPolicy: 'network-only',
      update: (data) => {
        const conf = _.get(data, 'pandocImport.config', {})
        return {
          enabled: _.get(conf, 'enabled', true),
          defaultOutputFormat: _.get(conf, 'defaultOutputFormat', 'gfm'),
          enableWikiNormalizer: _.get(conf, 'enableWikiNormalizer', true),
          enableAutoTypeDetection: _.get(conf, 'enableAutoTypeDetection', true),
          fallbackReader: _.get(conf, 'fallbackReader', 'markdown'),
          allowedFileTypes: _.get(conf, 'allowedFileTypes', ['docx', 'odt', 'html', 'md', 'txt']),
          maxFileSize: _.toSafeInteger(_.get(conf, 'maxFileSize', 10485760)),
          showWarnings: _.get(conf, 'showWarnings', true),
          pandocBinaryPath: _.get(conf, 'pandocBinaryPath', 'pandoc')
        }
      },
      watchLoading (isLoading) {
        this.$store.commit(`loading${isLoading ? 'Start' : 'Stop'}`, 'admin-pandoc-import-config')
      }
    },
    status: {
      query: pandocStatusQuery,
      fetchPolicy: 'network-only',
      update: (data) => _.cloneDeep(_.get(data, 'pandocImport.status', {})),
      watchLoading (isLoading) {
        this.$store.commit(`loading${isLoading ? 'Start' : 'Stop'}`, 'admin-pandoc-import-status')
      }
    }
  }
}
</script>

<style lang='scss'>

</style>
