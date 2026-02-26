/* global WIKI */

module.exports = async () => {
  WIKI.logger.info('Cleaning up unreferenced clipboard assets...')

  try {
    const result = await WIKI.models.assets.cleanupClipboardAssetsGlobal()
    WIKI.logger.info(`Cleaning up unreferenced clipboard assets: [ COMPLETED ] checked=${result.checkedCount} deleted=${result.deletedCount}`)
  } catch (err) {
    WIKI.logger.error('Cleaning up unreferenced clipboard assets: [ FAILED ]')
    WIKI.logger.error(err.message)
  }
}
