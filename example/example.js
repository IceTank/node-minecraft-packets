const mf = require('mineflayer')
const { generators } = require('minecraft-packets')
const mp = require('minecraft-protocol')
const { PacketCompare } = require('../src/packetcompare')
const repl = require('repl')

const version = '1.18.2'

const bot = mf.createBot({
  version,
  username: 'proxyBot',
  skipValidation: true
})

bot.on('kicked', console.error)
bot.on('error', console.error)
bot.on('end', () => console.info('Bot disconnected'))

const mcData = require('minecraft-data')(version)
/** @type { {VersionGenerator: typeof import('../src/versions/1.12').VersionGenerator} } */
const { VersionGenerator } = generators[mcData.version.majorVersion]
  
const packetGenerator = new VersionGenerator(bot)
const compare = new PacketCompare()

const loggedMap = false

bot._client.on('packet', (data, meta) => {
  // if (meta.name === 'map_chunk' && !loggedMap) {
  //   console.info(meta.name)
  //   loggedMap = true
  // } else console.info(meta.name)
  compare.onPacketsA(data, meta.name, 'server->client')
})

bot.on('spawn', () => {
  console.info('Login')
  
  const r = repl.start('> ')
  r.context.bot = bot
  r.context.compare = compare
  r.on('exit', () => {
    bot.end()
  })
  
  const server = mp.createServer({
    "online-mode": false,
    maxPlayers: 1,
    version: bot.version,
    port: 25566,
    keepAlive: false
  })

  server.on('login', (client) => {
    const ignore = ['map_chunk', 'tile_entity_data', 'declare_recipes']
    const loginPackets = packetGenerator.packetsLoginSequence()
    loginPackets.forEach(p => {
      compare.onPacketsB(p.data, p.name, 'server->client')
      // if (!ignore.includes(p.name)) console.info(p.name, p.data)
      // if (p.name === 'tile_entity_data') return
      if (!p.name || !p.data) console.info('No data for', p)
      client.write(p.name, p.data)
    })
    const onPacket = (data, meta) => {
      compare.onPacketsB(data, meta.name, 'client->server')
      // console.info(meta.name)
      // client.write(meta.name, data)
      // if (meta.name === 'set_compression') {
      //   client.compressionThreshold = data.threshold
      // } // Set compression
    }
    bot._client.on('packet', onPacket)
    client.on('end', () => {
      bot._client.removeListener('packet', onPacket)
    })
  })
})