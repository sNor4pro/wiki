<template lang='pug'>
  v-app
    .unauthorized
      .unauthorized-content
        img.animated.fadeIn(src='/_assets/svg/icon-delete-shield.svg', alt='Unauthorized')
        .headline {{ tr('unauthorized.title', 'Zugriff verweigert') }}
        .subtitle-1.mt-3 {{ actionLabel }}
        v-btn.mt-5(href='/login', x-large)
          v-icon(left) mdi-login
          span {{ tr('unauthorized.login', 'Anmelden') }}
        v-btn.mt-5(color='red lighten-4', href='javascript:window.history.go(-1);', outlined)
          v-icon(left) mdi-arrow-left
          span {{ tr('unauthorized.goback', 'Zurueck') }}
</template>

<script>

export default {
  props: {
    action: {
      type: String,
      default: 'view'
    }
  },
  data() {
    return { }
  },
  computed: {
    actionLabel () {
      const fallbacks = {
        create: 'Du darfst diese Seite nicht erstellen.',
        edit: 'Du darfst diese Seite nicht bearbeiten.',
        view: 'Du darfst diese Seite nicht ansehen.',
        history: 'Du darfst den Verlauf dieser Seite nicht ansehen.',
        source: 'Du darfst den Quelltext dieser Seite nicht ansehen.',
        sourceVersion: 'Du darfst den Quelltext dieser Version nicht ansehen.',
        download: 'Du darfst diese Seite nicht herunterladen.',
        downloadVersion: 'Du darfst diese Version nicht herunterladen.'
      }

      return this.tr(`unauthorized.action.${this.action}`, fallbacks[this.action] || 'Du darfst diese Aktion nicht ausfuehren.')
    }
  },
  methods: {
    tr (key, fallback) {
      const translated = this.$t(key)
      return translated === key ? fallback : translated
    }
  }
}
</script>

<style lang='scss'>

</style>
