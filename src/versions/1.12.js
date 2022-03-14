const { MineflayerGenerator } = require('../abstracts')
const { SmartBuffer } = require('smart-buffer')
const { Vec3 } = require('vec3')

const MAX_CHUNK_DATA_LENGTH = 31598

const dimension = {
  'minecraft:end': 1,
  'minecraft:overworld': 0,
  'minecraft:nether': -1
}

const gamemode = {
  survival: 0,
  creative: 1,
  adventure: 2,
  spectator: 3,
}

const difficulty = {
  peaceful: 0,
  easy: 1,
  normal: 2,
  hard: 3,
}

/**
 * @typedef ChunkEntity
 * @property {string} name
 * @property {string} type
 * @property {BlockEntity} value
 */

/**
 * @typedef Packet
 * @property {string} name
 * @property {any} data
 */

/**
 * 
 * @param {import('mineflayer').Bot} bot 
 * @param { { [pos: string]: ChunkEntity } } blockEntities 
 * @returns {Packet[]}
 */
function getChunkEntityPackets(bot, blockEntities) {
  const packets = []
  for (const nbtData of Object.values(blockEntities)) {
    const {
      x: { value: x },
      y: { value: y },
      z: { value: z },
    } = nbtData.value;
    const location = { x, y, z };
    packets.push({
      name: 'tile_entity_data', 
      data: { location, nbtData }
    })
    const block = bot.blockAt(new Vec3(x, y, z))
    if (block?.name == 'minecraft:chest') {
      packets.push({
        name: 'block_action', 
        data: { location, byte1: 1, byte2: 0, blockId: block.type 
        }
      })
    }
  }
  return packets
}

/**
 * 
 * @param {import('mineflayer').Bot} bot 
 * @param { { chunkX: number; chunkZ: number; column: any } } param1 
 * @param {number?} lastBitMask 
 * @param {SmartBuffer} chunkData 
 * @param {ChunkEntity} chunkEntities 
 * @returns {Packet[]}
 */
function chunkColumnToPackets(bot, { chunkX: x, chunkZ: z, column }, lastBitMask, chunkData = new SmartBuffer(), chunkEntities = []) {
  let bitMask = !!lastBitMask ? column.getMask() ^ (column.getMask() & ((lastBitMask << 1) - 1)) : column.getMask();
  let bitMap = lastBitMask ?? 0b0;
  let newChunkData = new SmartBuffer();

  // blockEntities
  // chunkEntities.push(...Object.values(column.blockEntities as Map<string, ChunkEntity>));

  // checks with bitmask if there is a chunk in memory that (a) exists and (b) was not sent to the client yet
  for (let i = 0; i < 16; i++) {
    if (bitMask & (0b1 << i)) {
      column.sections[i].write(newChunkData);
      bitMask ^= 0b1 << i;
      if (chunkData.length + newChunkData.length > MAX_CHUNK_DATA_LENGTH) {
        if (!lastBitMask) column.biomes?.forEach(biome => chunkData.writeUInt8(biome))
        return [
          {
            name: 'map_chunk', 
            data: {
              x, z, bitMap, chunkData: chunkData.toBuffer(), groundUp: !lastBitMask, blockEntities: [] 
            }
          },
          ...chunkColumnToPackets(bot, { chunkX: x, chunkZ: z, column }, 0b1 << i, newChunkData),
          ...getChunkEntityPackets(bot, column.blockEntities),
        ]
      }
      bitMap ^= 0b1 << i
      chunkData.writeBuffer(newChunkData.toBuffer())
      newChunkData.clear()
    }
  }
  if (!lastBitMask) column.biomes?.forEach(biome => chunkData.writeUInt8(biome))
  return [{
    name: 'map_chunk', 
    data: { 
      x, z, bitMap, chunkData: chunkData.toBuffer(), groundUp: !lastBitMask, blockEntities: [] 
    },
  },
  ...getChunkEntityPackets(bot, column.blockEntities)]
}

class VersionGenerator extends MineflayerGenerator {
  /**
   * @param {import('mineflayer').Bot} bot 
   */
  constructor(bot) {
    super(bot)
    const { toNotch: itemToNotch } = require('prismarine-item')(bot.version)
    this.itemToNotch = itemToNotch
    this._monkeyPatch()
  }

  _monkeyPatch() {
    this.bot.recipes = []
    this.bot._client.on('packet', (data, meta) => {
      if (data.metadata && data.entityId && this.bot.entities[data.entityId]) {
        this.bot.entities[data.entityId].rawMetadata = data.metadata
      }
      switch (meta.name) {
        case 'unlock_recipes':
          switch (data.action) {
            case 0: //* initialize
              this.bot.recipes = data.recipes1;
              break;
            case 1: //* add
              this.bot.recipes = [...this.bot.recipes, ...data.recipes1];
              break;
            case 2: //* remove
              this.bot.recipes = Array.from(
                data.recipes1.reduce((recipes, recipe) => {
                  recipes.delete(recipe);
                  return recipes;
                }, new Set(this.bot.recipes))
              );
              break;
          }
          break;
        case 'abilities':
          this.bot.physicsEnabled = !!((data.flags & 0b10) ^ 0b10);
          break;
      }
    })
    // this.bot._client.on('packet', this._onServerPacket.bind(this))
  }

  /**
   * 
   * @returns {Packet[]}
   */
  packetsLoginSequence() {
    const otherPlayers = () => {
      const packets = []
      const players = this.bot.players
      for (const p in players) {
        if (this.bot.player.uuid === players[p].uuid) continue
        const { uuid, username, gamemode, ping, entity } = players[p]
        packets.push({
          name: 'player_info',
          data: {
            action: 0,
            data: [{ UUID: uuid, name: username, properties: [], gamemode, ping, displayName: undefined }],
          }
        })
        if (entity) {
          packets.push({
            name: 'named_entity_spawn',
            data: {
              ...entity.position,
              entityId: entity.id,
              playerUUID: uuid,
              yaw: -(Math.floor(((entity.yaw / Math.PI) * 128 + 255) % 256) - 127),
              pitch: -Math.floor(((entity.pitch / Math.PI) * 128) % 256),
              metadata: entity.rawMetadata,
            },
          })
          if (entity.headYaw) {
            packets.push({
              name: 'entity_head_rotation',
              data: {
                entityId: entity.id,
                headYaw: -(Math.floor(((entity.headYaw / Math.PI) * 128 + 255) % 256) - 127),
              },
            })
          }
        }
      }
      return packets
    }

    const chunks = () => {
      const packets = []
      for (const col of this.bot.world.getColumns()) {
        packets.push(...chunkColumnToPackets(this.bot, col))
      }
      return packets
    }

    const entities = () => {
      const packets = []
      for (const id in this.bot.entities) {
        const entity = this.bot.entities[id]
        switch (entity.type) {
          case 'orb':
            packets.push({
              name: 'spawn_entity_experience_orb',
              data: {
                ...entity.position,
                entityId: entity.id,
                count: entity.count,
              },
            })
            break
          case 'mob':
            packets.push(
              {
                name: 'spawn_entity_living',
                data: {
                  ...entity.position,
                  entityId: entity.id,
                  entityUUID: entity.uuid,
                  type: entity.entityType,
                  yaw: entity.yaw,
                  pitch: entity.pitch,
                  headPitch: entity.headPitch,
                  velocityX: entity.velocity.x,
                  velocityY: entity.velocity.y,
                  velocityZ: entity.velocity.z,
                  metadata: entity.rawMetadata,
                },
              },
              ...entity.equipment.reduce((arr, item, slot) => {
                if (item)
                  arr.push({
                    name: 'entity_equipment',
                    data: {
                      entityId: entity.id,
                      slot,
                      item: itemToNotch(item),
                    },
                  })
                return arr
              }, [])
            );
            break
          case 'object':
            packets.push({
              name: 'spawn_entity',
              data: {
                ...entity.position,
                entityId: entity.id,
                objectUUID: entity.uuid,
                type: entity.entityType,
                yaw: entity.yaw,
                pitch: entity.pitch,
                objectData: entity.objectData,
                velocityX: entity.velocity.x,
                velocityY: entity.velocity.y,
                velocityZ: entity.velocity.z,
              },
            })
            break
        }
        if (entity.rawMetadata?.length > 0){
          packets.push({
            name: 'entity_metadata',
            data: {
              entityId: entity.id,
              metadata: entity.rawMetadata,
            },
          })
        }
        return packets
      }
    }

    return [
    {
      name: 'login',
      data: {
        entityId: this.bot.entity.id,
        gamemode: this.bot.player.gamemode,
        dimension: dimension[this.bot.game.dimension],
        difficulty: difficulty[this.bot.game.difficulty],
        maxPlayers: this.bot.game.maxPlayers,
        levelType: this.bot.game.levelType,
        reducedDebugInfo: false,
      }
    }, {
      name: 'respawn',
      data: {
        gamemode: this.bot.player.gamemode,
        dimension: dimension[this.bot.game.dimension],
        difficulty: difficulty[this.bot.game.difficulty],
        levelType: this.bot.game.levelType,
      },
    }, {
      name: 'abilities',
      data: {
        flags: (this.bot.physicsEnabled ? 0b0 : 0b10) | ([1, 3].includes(this.bot.player.gamemode) ? 0b0 : 0b100) | (this.bot.player.gamemode !== 1 ? 0b0 : 0b1000),
        flyingSpeed: 0.05,
        walkingSpeed: 0.1,
      }
    }, {
      name: 'held_item_slot', 
      data: { 
        slot: this.bot.quickBarSlot ?? 1 
      }
    }, {
      name: 'unlock_recipes',
      data: {
        action: 0,
        craftingBookOpen: false,
        filteringCraftable: false,
        recipes1: this.bot.recipes,
        recipes2: this.bot.recipes,
      }
    }, {
      name: 'game_state_change', 
      data: { reason: 3, gameMode: this.bot.player.gamemode 
      }
    }, {
      name: 'update_health',
      data: {
        health: this.bot.health,
        food: this.bot.food,
        foodSaturation: this.bot.foodSaturation,
      },
    },
    //* inventory
    {
      name: 'window_items',
      data: {
        windowId: 0,
        items: this.bot.inventory.slots.map((item) => this.itemToNotch(item)),
      },
    },
    {
      name: 'position',
      data: {
        ...this.bot.entity.position,
        yaw: 180 - (this.bot.entity.yaw * 180) / Math.PI,
        pitch: -(this.bot.entity.pitch * 180) / Math.PI,
      },
    },
    {
      name: 'spawn_position',
      data: {
        location: this.bot.spawnPoint ?? this.bot.entity.position,
      },
    },
    //! move playerlist here
    //* player_info (personal)
    //* the client's player_info packet
    {
      name: 'player_info',
      data: {
        action: 0,
        data: [
          {
            UUID: this.bot.player.uuid,
            name: this.bot.username,
            properties: [],
            gamemode: this.bot.player.gamemode,
            ping: this.bot.player.ping,
            displayName: undefined,
          },
        ],
      },
    },
    //* other players' info
    ...otherPlayers(),

    // Chunks 
    ...chunks(),
    // ...(bot.world.getColumns() as any[]).reduce<Packet[]>((packets, chunk) => [...packets, ...chunkColumnToPackets(bot, chunk)], []),
    //? `world_border` (as of 1.12.2) => really needed?
    //! block entities moved to chunk packet area
    // Entities
    ...entities()
    ]
  }
}

module.exports = {
  VersionGenerator
}