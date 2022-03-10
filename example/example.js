const mf = require('mineflayer')
const { generators } = require('minecraft-packets')
const mp = require('minecraft-protocol')

const bot = mf.createBot({
  version: '1.12.2',
  username: 'proxyBot',
  skipValidation: true
})

bot.on('kicked', console.error)
bot.on('error', console.error)
bot.on('end', () => console.info('Bot disconnected'))

bot._client.on('packet', (data, meta) => {
  if (data.metadata && data.entityId && bot.entities[data.entityId]) {
    bot.entities[data.entityId].rawMetadata = data.metadata
  }
  switch (meta.name) {
    case 'unlock_recipes':
      switch (data.action) {
        case 0: //* initialize
          bot.recipes = data.recipes1;
          break;
        case 1: //* add
          bot.recipes = [...bot.recipes, ...data.recipes1];
          break;
        case 2: //* remove
          bot.recipes = Array.from(
            data.recipes1.reduce((recipes, recipe) => {
              recipes.delete(recipe);
              return recipes;
            }, new Set(bot.recipes))
          );
          break;
      }
      break;
    case 'abilities':
      bot.physicsEnabled = !!((data.flags & 0b10) ^ 0b10);
      break;
  }
})

bot.recipes = []

bot.on('spawn', () => {
  console.info('Login')
  const mcData = require('minecraft-data')(bot.version)
  
  /** @type { {VersionGenerator: typeof import('../src/versions/1.12').VersionGenerator} } */
  const { VersionGenerator } = generators[mcData.version.majorVersion]

  
  const gen = new VersionGenerator(bot)
  
  const server = mp.createServer({
    "online-mode": false,
    maxPlayers: 1,
    version: bot.version,
    port: 25566
  })

  server.on('login', (client) => {
    const ignore = ['map_chunk', 'tile_entity_data']
    const loginPackets = gen.loginSequence()
    loginPackets.forEach(p => {
      // if (!ignore.includes(p.name)) console.info(p.name, p.data)
      // if (p.name === 'tile_entity_data') return
      client.write(p.name, p.data)
    })
    const onPacket = (data, meta) => {
      console.info(meta.name)
      client.write(meta.name, data)
    }
    bot._client.on('packet', onPacket)
    client.on('end', () => {
      bot._client.removeListener('packet', onPacket)
    })
  })
})