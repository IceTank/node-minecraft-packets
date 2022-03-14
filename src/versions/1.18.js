const { MineflayerGenerator } = require('../abstracts')
// const { SmartBuffer } = require('smart-buffer')
// const { Vec3 } = require('vec3')

/**
 * @typedef Packet
 * @property {string} name
 * @property {any} data
 */

/**
 * @typedef loginPacketData
 * @property { number } entityId
 * @property { boolean } isHardcore
 * @property {number} gameMode
 * @property {number} previousGameMode
 * @property { Array<string> } worldNames
 * @property { Object } dimensionCodec
 * @property { Object } dimension
 * @property { string } worldName
 * @property { number } hashedSeed
 * @property { number } maxPlayers
 * @property { number } viewDistance
 * @property { number } simulationDistance
 * @property { boolean } reducedDebugInfo
 * @property { boolean } enableRespawnScreen
 * @property { boolean } isDebug
 * @property { boolean } isFlat
 */

const difficulty = {
  peaceful: 0,
  easy: 1,
  normal: 2,
  hard: 3,
}

// /**
//  * 
//  * @param {import('mineflayer').Bot} bot 
//  * @param { { chunkX: number; chunkZ: number; column: any } } param1 
//  * @param {number?} lastBitMask 
//  * @param {SmartBuffer} chunkData 
//  * @param {ChunkEntity} chunkEntities 
//  * @returns {Packet[]}
//  */
//  function chunkColumnToPackets(bot, { chunkX: x, chunkZ: z, column }, lastBitMask, chunkData = new SmartBuffer(), chunkEntities = []) {
//   let bitMask = !!lastBitMask ? column.getMask() ^ (column.getMask() & ((lastBitMask << 1) - 1)) : column.getMask()
//   let bitMap = lastBitMask ?? 0b0
//   let newChunkData = new SmartBuffer()

//   // blockEntities
//   // chunkEntities.push(...Object.values(column.blockEntities as Map<string, ChunkEntity>));

//   // checks with bitmask if there is a chunk in memory that (a) exists and (b) was not sent to the client yet
//   for (let i = 0; i < 16; i++) {
//     if (bitMask & (0b1 << i)) {
//       column.sections[i].write(newChunkData)
//       bitMask ^= 0b1 << i;
//       if (chunkData.length + newChunkData.length > MAX_CHUNK_DATA_LENGTH) {
//         if (!lastBitMask) column.biomes?.forEach(biome => chunkData.writeUInt8(biome))
//         return [
//           {
//             name: 'map_chunk', 
//             data: {
//               x, z, bitMap, chunkData: chunkData.toBuffer(), groundUp: !lastBitMask, blockEntities: [] 
//             }
//           },
//           ...chunkColumnToPackets(bot, { chunkX: x, chunkZ: z, column }, 0b1 << i, newChunkData),
//           ...getChunkEntityPackets(bot, column.blockEntities),
//         ]
//       }
//       bitMap ^= 0b1 << i
//       chunkData.writeBuffer(newChunkData.toBuffer())
//       newChunkData.clear()
//     }
//   }
//   if (!lastBitMask) column.biomes?.forEach(biome => chunkData.writeUInt8(biome))
//   return [{
//     name: 'map_chunk', 
//     data: { 
//       x, z, bitMap, chunkData: chunkData.toBuffer(), groundUp: !lastBitMask, blockEntities: [] 
//     },
//   },
//   ...getChunkEntityPackets(bot, column.blockEntities)]
// }

function chunkColumnToPackets(bot, col) {
  const { chunkX: x, chunkZ: z, column } = col
  debugger
  return [{
    name: 'map_chunk', 
    data: {
      x: x,
      z: z,
      heightmaps: {
        type: 'compound',
        name: '',
        value: {
          MOTION_BLOCKING: { type: 'longArray', value: new Array(36).fill([0, 0]) }
        }
      }, // FIXME: fake heightmap
      chunkData: column.dump(),
      blockEntities: [],
      trustEdges: true,
      skyLightMask: [ 0, 7680 ],
      blockLightMask: [ 0, 388 ],
      emptySkyLightMask: [0, 511],
      emptyBlockLightMask: [0, 7803],
      groundUp: true,
      skyLight: [],
      blockLight: [],
      // bitMap: column.getMask(),
      // biomes: column.dumpBiomes(),
      // ignoreOldData: true, // should be false when a chunk section is updated instead of the whole chunk being overwritten, do we ever do that?
    }
  }]
}

class VersionGenerator extends MineflayerGenerator {
  /**
   * @param {import('mineflayer').Bot} bot 
   */
   constructor(bot) {
    super(bot)
    const { toNotch: itemToNotch } = require('prismarine-item')(bot.version)
    this.itemToNotch = itemToNotch
    this.registry = require('prismarine-registry')(bot.version)

    /** @type {loginPacketData | null} */
    this.loginPacketData = null
    this._monkeyPatch()
  }

  _monkeyPatch() {
    this.bot._client.on('login', (data) => {
      this.loginPacketData = data
    })
    this.bot.recipes = []
    this.bot.declared_recipes = []
    this.bot.declared_commands = []
    this.bot._client.on('packet', (data, meta) => {
      // console.info('Packet', meta.name)
      if (data.metadata && data.entityId && this.bot.entities[data.entityId]) {
        this.bot.entities[data.entityId].rawMetadata = data.metadata
      }
      if (meta.data === 'window_items') {
        console.info(data)
      }
      switch (meta.name) {
        case 'declare_recipes':
          this.bot.declared_recipes = data.recipes
          console.info('Saved', this.bot.recipes?.length, 'declared recipes')
          break
        case 'tags':
          this.bot.tags = data.tags
          break
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
        case 'declare_commands':
          this.bot.declared_commands = data
          break
        case 'update_view_distance':
          this.bot.viewDistance = data.viewDistance
          break
        case 'simulation_distance':
          this.bot.simulation_distance = data.distance
          break
        case 'abilities': // What do? 
          this.bot.physicsEnabled = !!((data.flags & 0b10) ^ 0b10);
          break
      }
    })
  }

  /**
   * @returns {Packet[]}
   */
  packetsLoginSequence() {
    const loginPacket = {
      entityId: 494,
      isHardcore: false,
      gameMode: 0,
      previousGameMode: -1,
      worldNames: [
        'minecraft:overworld',
        'minecraft:the_nether',
        'minecraft:the_end'
      ],
      dimensionCodec: {
        type: 'compound',
        name: '',
        value: {
          'minecraft:dimension_type': [Object],
          'minecraft:worldgen/biome': [Object]
        }
      },
      dimension: {
        type: 'compound',
        name: '',
        value: {
          infiniburn: [Object],
          effects: [Object],
          ultrawarm: [Object],
          logical_height: [Object],
          height: [Object],
          natural: [Object],
          min_y: [Object],
          bed_works: [Object],
          coordinate_scale: [Object],
          piglin_safe: [Object],
          has_skylight: [Object],
          has_ceiling: [Object],
          ambient_light: [Object],
          has_raids: [Object],
          respawn_anchor_works: [Object]
        }
      },
      worldName: 'minecraft:overworld',
      hashedSeed: 1213778293047711577n,
      maxPlayers: 20,
      viewDistance: 11,
      simulationDistance: 10,
      reducedDebugInfo: false,
      enableRespawnScreen: true,
      isDebug: false,
      isFlat: false
    }

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
            data: [{ UUID: uuid, name: username, properties: [], gamemode: gamemode ?? 0, ping, displayName: undefined }],
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

    const inventory = () => {
      if (!this.bot.inventory.slots.reduce((p, i) => {
        return i && p
      }, false)) return []
      return [{
        name: 'window_items',
        data: {
          windowId: 0,
          items: this.bot.inventory.slots.map((item) => this.itemToNotch(item)),
        }
      }]
    }

    const chunks = () => {
      const packets = []
      for (const col of this.bot.world.getColumns()) {
        packets.push(...chunkColumnToPackets(this.bot, col))
      }
      return packets
    }

    /**
     * login
      custom_payload (Optional)
      difficulty
      abilities (Optional)    
      held_item_slot  x
      declare_recipes x
      tags  x
      entity_status   x
      unlock_recipes  x
      declare_commands x
      position        x
      chat
      player_info x
      player_info x
      update_view_distance  x
      simulation_distance x
      update_view_position x

      // Entities in the initial chunks
      spawn_entity_living
      entity_metadata
      entity_update_attributes
      entity_equipment (Optional)
      entity_head_rotation
      ...

      initialize_world_border x
      update_time
      spawn_position
      window_items
      map_chunk
      update_health
     */
    if (!this.loginPacketData) throw new Error('Ow Nowo wee cannot dow this. (Login packet data is not defined)')
    return [
      {
        name: 'login',
        data: {
          entityId: this.bot.entity.id,
          isHardcore: this.bot.game.hardcore,
          gameMode: this.bot.player.gamemode,
          previousGameMode: -1,
          worldNames: this.loginPacketData.worldNames,
          dimensionCodec: this.loginPacketData.dimensionCodec,
          dimension: this.loginPacketData.dimension,
          worldName: this.bot.game.dimension,
          hashedSeed: this.loginPacketData.hashedSeed,
          maxPlayers: this.bot.game.maxPlayers,
          viewDistance: this.loginPacketData.viewDistance,
          simulationDistance: this.loginPacketData.simulationDistance,
          reducedDebugInfo: this.loginPacketData.reducedDebugInfo,
          enableRespawnScreen: this.loginPacketData.enableRespawnScreen,
          isDebug: this.loginPacketData.isDebug,
          isFlat: this.loginPacketData.isFlat,
        }
      }, 
      // { // Dose not seam to work with nmp
      //   name: "custom_payload",
      //   data: {
      //     channel: "minecraft:brand",
      //     data: "Paper"
      //   }
      // }, 
      {
        name: 'difficulty',
        data: {
          difficulty: difficulty[this.bot.game.difficulty],
          difficultyLocked: false
        }
      }, {
        name: "abilities",
        data: {
          flags: 0,
          flyingSpeed: 0.05000000074505806,
          walkingSpeed: 0.10000000149011612
        }
      }, 
      {
        name: 'held_item_slot',
        data: {
          slot: this.bot.quickBarSlot ?? 1
        }
      }, 
      {
        name: 'declare_recipes',
        data: {
          recipes: this.bot.declared_recipes
        }
      }, 
      {
        name: 'tags',
        data: {
          tags: this.bot.tags ?? []
        }
      }, 
      {
        name: 'entity_status',
        data: {
          entityId: this.bot.entity.id,
          entityStatus: 24 // Normal plebian player 25 to 28 == op level 1 to 4
        }
      }, 
      // {
      //   name: 'unlocked_recipes',
      //   data: {
      //     action: 0,
      //     craftingBookOpen: false,
      //     smeltingBookOpen: false,
      //     filteringSmeltable: false,
      //     filteringCraftable: false,
      //     blastFurnaceOpen: false,
      //     filteringBlastFurnace: false,
      //     smokerBookOpen: false,
      //     filteringSmoker: false,
      //     recipes1: this.bot.recipes,
      //     recipes2: this.bot.recipes,
      //   }
      // }, 
      {
        name: 'declare_commands',
        data: this.bot.declared_commands
      }, 
      {
        name: 'position',
        data: {
          ...this.bot.entity.position,
          yaw: 180 - (this.bot.entity.yaw * 180) / Math.PI,
          pitch: -(this.bot.entity.pitch * 180) / Math.PI,
          flags: 0,
          teleportId: 1,
          dismountVehicle: false
        },
      }, {
        name: 'player_info',
        data: {
          action: 0,
          data: [
            {
              UUID: this.bot.player.uuid,
              name: this.bot.username,
              properties: [],
              gamemode: this.bot.player.gamemode ?? 0,
              ping: this.bot.player.ping,
              displayName: undefined,
            },
          ],
        }
      }, {
        name: 'player_info',
        data: {
          action: 0,
          data: [
            {
              UUID: this.bot.player.uuid,
              name: this.bot.username,
              properties: [],
              gamemode: this.bot.player.gamemode ?? 0,
              ping: this.bot.player.ping,
              displayName: undefined,
            },
          ],
        }
      },
      ...otherPlayers(),
      {
        name: 'update_view_distance',
        data: {
          viewDistance: this.bot.viewDistance
        }
      }, {
        name: 'simulation_distance',
        data: {
          distance: this.bot.simulation_distance
        }
      }, {
        name: 'update_view_position',
        data: {
          chunkX: Math.floor(this.bot.entity.position.x / 16),
          chunkZ: Math.floor(this.bot.entity.position.z / 16)
        }
      }, 
      // TODO spawn entity living here
      {
        name: 'initialize_world_border',
        data: { // Let's just hard code it
          x: 0,
          z: 0,
          oldDiameter: 59999968,
          newDiameter: 59999968,
          speed: 0,
          portalTeleportBoundary: 29999984,
          warningBlocks: 5,
          warningTime: 15
        }
      }, {
        name: 'spawn_position', // Compass position, Eh who cares
        data: {
          location: { x: 0, z: 0, y: 64 }, 
          angle: 0
        }
      },
      {
        name: 'update_health',
        data: {
          health: this.bot.health,
          food: this.bot.food,
          foodSaturation: this.bot.foodSaturation,
        }
      },
      // TODO inventory
      ...inventory(),
      ...chunks()
    ]
  }
}

module.exports = {
  VersionGenerator
}
