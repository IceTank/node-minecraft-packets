const supportedVersions = ['1.12']

/**
 * @property {import('mineflayer').Bot} bot
 * @property {typeof import('minecraft-data').MinecraftData} mcData
 * @property {string} version
 */
class MineflayerGenerator {
  /**
   * @param {import('mineflayer').Bot} bot 
   */
  constructor(bot) {
    const mcData = require('minecraft-data')(bot.version)
    if (!supportedVersions.includes(mcData.version.majorVersion)) {
      throw new Error(`Version ${version} not supported`)
    }
    this.bot = bot
    this.mcData = mcData
    this.version = mcData.version.majorVersion
  }

  loginSequence() {
    throw notImplementedError(this)
  }
}

function notImplementedError(that) {
  return new Error(that.constructor.name, 'Not implemented by child class. This should not happen.')
}

module.exports = {
  MineflayerGenerator,
  supportedVersions
}