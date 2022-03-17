# node-minecraft-packets

## Features
- Generate login sequence packets for version 1.12.2 and 1.18.2
  - Can synchronize a client up to the current state the bot is in
  - Can be used with mcproxy to 'join' into the world the bot sees
  - Example 
    - [1.18.2 (adapted mcproxy repo)](https://github.com/IceTank/mcproxy-1/tree/middleware-1-18) 
    - [1.12.2 (original 1.12.2 code)](https://github.com/rob9315/mcproxy)
    - [1.12.2 join the bot instance world and see the bot as a fake player](https://github.com/IceTank/mineflayer-proxy-inspector)

## Possible use cases to implement
- Generate Packets for login sequences (done for 1.12.2 and 1.18.2)
  - Abstracted use
  - Version independent
- Encourage contributors to move mineflayer state related information into prismarine-world
- Build simple interfaces to manage more complex proxy implementation. 
- Enable packet manipulation like in this [branch](https://github.com/IceTank/mcproxy-1/tree/middleware).
- Enable proxy's that can synchronize a bot's state to a connecting client after the bot has joined (Current nmp proxy example needs the client to connect at the same time as the bot/client to synchronize with the world off the server. mcproxy solves this issue but is in parts hard coded for version 1.12.2).
- Convert packets between versions or platform in real time.
- (Maybe) Manage nmp `Server` instance
- (Maybe) Manage multiple client instances for a proxy controlling a bot

## TODO:
- Implement login sequence for version 1.8 - 1.17
- Move more state information from mineflayer to prismarine-world
  - Entities
  - Declared recipes
  - Unlocked recipes
  - More world information (for 1.18.2)
  - Player attributes
  - Bot position (?)
  - Other player info (maybe make a new prismarine package)
- All the other stuff in use cases