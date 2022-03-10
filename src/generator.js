const supportedVersions = require('./abstracts').supportedVersions
const versionGenerator = {}

supportedVersions.forEach(gen => {
  versionGenerator[gen] = require(`./versions/${gen}`)
})

module.exports = versionGenerator

