const RAW_CODEWORDS = [0, 26, 44, 70, 100, 134, 172]
const ECC_CODEWORDS_PER_BLOCK = [0, 7, 10, 15, 20, 26, 18]
const NUM_ERROR_CORRECTION_BLOCKS = [0, 1, 1, 1, 1, 1, 2]
const ALIGNMENT_PATTERN_POSITIONS = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
]

let gfExp = null
let gfLog = null

function initGaloisField() {
  if (gfExp && gfLog) {
    return
  }

  gfExp = Array(512).fill(0)
  gfLog = Array(256).fill(0)

  let value = 1

  for (let i = 0; i < 255; i += 1) {
    gfExp[i] = value
    gfLog[value] = i
    value <<= 1

    if (value & 0x100) {
      value ^= 0x11d
    }
  }

  for (let i = 255; i < 512; i += 1) {
    gfExp[i] = gfExp[i - 255]
  }
}

function gfMultiply(a, b) {
  if (a === 0 || b === 0) {
    return 0
  }

  initGaloisField()
  return gfExp[gfLog[a] + gfLog[b]]
}

function appendBits(buffer, value, length) {
  for (let i = length - 1; i >= 0; i -= 1) {
    buffer.push(((value >>> i) & 1) === 1)
  }
}

function dataCodewordCount(version) {
  return RAW_CODEWORDS[version] - (ECC_CODEWORDS_PER_BLOCK[version] * NUM_ERROR_CORRECTION_BLOCKS[version])
}

function chooseVersion(byteLength) {
  for (let version = 1; version <= 6; version += 1) {
    const characterCountBits = version < 10 ? 8 : 16
    const requiredBits = 4 + characterCountBits + (byteLength * 8)

    if (requiredBits <= dataCodewordCount(version) * 8) {
      return version
    }
  }

  throw new Error('QR payload is too long for the built-in generator.')
}

function makeDataCodewords(bytes, version) {
  const capacity = dataCodewordCount(version)
  const capacityBits = capacity * 8
  const bits = []

  appendBits(bits, 0x4, 4)
  appendBits(bits, bytes.length, version < 10 ? 8 : 16)
  bytes.forEach((byte) => appendBits(bits, byte, 8))
  appendBits(bits, 0, Math.min(4, capacityBits - bits.length))

  while (bits.length % 8 !== 0) {
    bits.push(false)
  }

  const data = []

  for (let i = 0; i < bits.length; i += 8) {
    let value = 0

    for (let j = 0; j < 8; j += 1) {
      value = (value << 1) | (bits[i + j] ? 1 : 0)
    }

    data.push(value)
  }

  for (let pad = 0xec; data.length < capacity; pad ^= 0xfd) {
    data.push(pad)
  }

  return data
}

function reedSolomonDivisor(degree) {
  let result = [1]

  for (let i = 0; i < degree; i += 1) {
    const root = gfExp[i]
    const next = Array(result.length + 1).fill(0)

    result.forEach((coefficient, index) => {
      next[index] ^= coefficient
      next[index + 1] ^= gfMultiply(coefficient, root)
    })

    result = next
  }

  return result
}

function reedSolomonRemainder(data, degree) {
  initGaloisField()

  const divisor = reedSolomonDivisor(degree)
  const result = Array(degree).fill(0)

  data.forEach((byte) => {
    const factor = byte ^ result.shift()
    result.push(0)

    for (let i = 0; i < degree; i += 1) {
      result[i] ^= gfMultiply(divisor[i + 1], factor)
    }
  })

  return result
}

function addErrorCorrection(data, version) {
  const blockCount = NUM_ERROR_CORRECTION_BLOCKS[version]
  const eccLength = ECC_CODEWORDS_PER_BLOCK[version]
  const rawCodewordCount = RAW_CODEWORDS[version]
  const shortBlockCount = blockCount - (rawCodewordCount % blockCount)
  const shortBlockLength = Math.floor(rawCodewordCount / blockCount)
  const blocks = []
  let offset = 0

  for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
    const dataLength = shortBlockLength - eccLength + (blockIndex < shortBlockCount ? 0 : 1)
    const dataBlock = data.slice(offset, offset + dataLength)
    const eccBlock = reedSolomonRemainder(dataBlock, eccLength)
    blocks.push({ data: dataBlock, ecc: eccBlock })
    offset += dataLength
  }

  const result = []
  const maxDataLength = Math.max(...blocks.map((block) => block.data.length))

  for (let i = 0; i < maxDataLength; i += 1) {
    blocks.forEach((block) => {
      if (i < block.data.length) {
        result.push(block.data[i])
      }
    })
  }

  for (let i = 0; i < eccLength; i += 1) {
    blocks.forEach((block) => result.push(block.ecc[i]))
  }

  return result
}

function createMatrix(size) {
  return Array.from({ length: size }, () => Array(size).fill(false))
}

function drawFunctionModule(modules, isFunction, x, y, isDark) {
  const size = modules.length

  if (x < 0 || y < 0 || x >= size || y >= size) {
    return
  }

  modules[y][x] = isDark
  isFunction[y][x] = true
}

function drawFinderPattern(modules, isFunction, left, top) {
  for (let y = -1; y <= 7; y += 1) {
    for (let x = -1; x <= 7; x += 1) {
      const xx = left + x
      const yy = top + y
      const inFinder = x >= 0 && x <= 6 && y >= 0 && y <= 6
      const isDark = inFinder && (
        x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4)
      )

      drawFunctionModule(modules, isFunction, xx, yy, isDark)
    }
  }
}

function drawAlignmentPattern(modules, isFunction, centerX, centerY) {
  for (let y = -2; y <= 2; y += 1) {
    for (let x = -2; x <= 2; x += 1) {
      const distance = Math.max(Math.abs(x), Math.abs(y))
      drawFunctionModule(modules, isFunction, centerX + x, centerY + y, distance !== 1)
    }
  }
}

function reserveFormatModules(modules, isFunction) {
  const size = modules.length

  for (let i = 0; i <= 8; i += 1) {
    if (i !== 6) {
      drawFunctionModule(modules, isFunction, 8, i, false)
      drawFunctionModule(modules, isFunction, i, 8, false)
    }
  }

  for (let i = 0; i < 8; i += 1) {
    drawFunctionModule(modules, isFunction, size - 1 - i, 8, false)
  }

  for (let i = 8; i < 15; i += 1) {
    drawFunctionModule(modules, isFunction, 8, size - 15 + i, false)
  }
}

function drawBaseMatrix(version) {
  const size = 21 + ((version - 1) * 4)
  const modules = createMatrix(size)
  const isFunction = createMatrix(size)

  drawFinderPattern(modules, isFunction, 0, 0)
  drawFinderPattern(modules, isFunction, size - 7, 0)
  drawFinderPattern(modules, isFunction, 0, size - 7)

  const alignmentPositions = ALIGNMENT_PATTERN_POSITIONS[version]
  alignmentPositions.forEach((x) => {
    alignmentPositions.forEach((y) => {
      const overlapsFinder = (x === 6 && y === 6)
        || (x === 6 && y === size - 7)
        || (x === size - 7 && y === 6)

      if (!overlapsFinder) {
        drawAlignmentPattern(modules, isFunction, x, y)
      }
    })
  })

  for (let i = 8; i < size - 8; i += 1) {
    const isDark = i % 2 === 0
    drawFunctionModule(modules, isFunction, 6, i, isDark)
    drawFunctionModule(modules, isFunction, i, 6, isDark)
  }

  reserveFormatModules(modules, isFunction)
  drawFunctionModule(modules, isFunction, 8, size - 8, true)

  return { modules, isFunction }
}

function codewordsToBits(codewords) {
  const bits = []
  codewords.forEach((codeword) => appendBits(bits, codeword, 8))
  return bits
}

function drawCodewords(modules, isFunction, codewords) {
  const size = modules.length
  const bits = codewordsToBits(codewords)
  let bitIndex = 0
  let upward = true

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right -= 1
    }

    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset
        const y = upward ? size - 1 - vertical : vertical

        if (!isFunction[y][x]) {
          modules[y][x] = bitIndex < bits.length ? bits[bitIndex] : false
          bitIndex += 1
        }
      }
    }

    upward = !upward
  }
}

function maskBit(mask, x, y) {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0
    case 1:
      return y % 2 === 0
    case 2:
      return x % 3 === 0
    case 3:
      return (x + y) % 3 === 0
    case 4:
      return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0
    case 7:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
    default:
      return false
  }
}

function applyMask(modules, isFunction, mask) {
  const size = modules.length

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!isFunction[y][x] && maskBit(mask, x, y)) {
        modules[y][x] = !modules[y][x]
      }
    }
  }
}

function formatBits(mask) {
  const errorCorrectionLevelBits = 1
  const data = (errorCorrectionLevelBits << 3) | mask
  let remainder = data << 10

  for (let i = 14; i >= 10; i -= 1) {
    if (((remainder >>> i) & 1) !== 0) {
      remainder ^= 0x537 << (i - 10)
    }
  }

  return ((data << 10) | remainder) ^ 0x5412
}

function getBit(value, index) {
  return ((value >>> index) & 1) !== 0
}

function drawFormatBits(modules, mask) {
  const size = modules.length
  const bits = formatBits(mask)

  for (let i = 0; i <= 5; i += 1) {
    modules[i][8] = getBit(bits, i)
  }

  modules[7][8] = getBit(bits, 6)
  modules[8][8] = getBit(bits, 7)
  modules[8][7] = getBit(bits, 8)

  for (let i = 9; i < 15; i += 1) {
    modules[8][14 - i] = getBit(bits, i)
  }

  for (let i = 0; i < 8; i += 1) {
    modules[8][size - 1 - i] = getBit(bits, i)
  }

  for (let i = 8; i < 15; i += 1) {
    modules[size - 15 + i][8] = getBit(bits, i)
  }

  modules[size - 8][8] = true
}

function cloneMatrix(modules) {
  return modules.map((row) => row.slice())
}

function linePenalty(line) {
  let penalty = 0
  let runColor = line[0]
  let runLength = 1

  for (let i = 1; i < line.length; i += 1) {
    if (line[i] === runColor) {
      runLength += 1
      continue
    }

    if (runLength >= 5) {
      penalty += 3 + (runLength - 5)
    }

    runColor = line[i]
    runLength = 1
  }

  if (runLength >= 5) {
    penalty += 3 + (runLength - 5)
  }

  return penalty
}

function penaltyScore(modules) {
  const size = modules.length
  let penalty = 0
  let darkModules = 0

  for (let y = 0; y < size; y += 1) {
    penalty += linePenalty(modules[y])

    for (let x = 0; x < size; x += 1) {
      if (modules[y][x]) {
        darkModules += 1
      }

      if (x > 0 && y > 0) {
        const color = modules[y][x]

        if (
          color === modules[y][x - 1]
          && color === modules[y - 1][x]
          && color === modules[y - 1][x - 1]
        ) {
          penalty += 3
        }
      }
    }
  }

  for (let x = 0; x < size; x += 1) {
    const column = []

    for (let y = 0; y < size; y += 1) {
      column.push(modules[y][x])
    }

    penalty += linePenalty(column)
  }

  const totalModules = size * size
  const balancePenalty = Math.ceil(Math.abs((darkModules * 20) - (totalModules * 10)) / totalModules) - 1

  return penalty + (Math.max(0, balancePenalty) * 10)
}

export function createQrCode(value) {
  const bytes = Array.from(new TextEncoder().encode(String(value)))
  const version = chooseVersion(bytes.length)
  const dataCodewords = makeDataCodewords(bytes, version)
  const codewords = addErrorCorrection(dataCodewords, version)
  const { modules: baseModules, isFunction } = drawBaseMatrix(version)

  drawCodewords(baseModules, isFunction, codewords)

  let bestModules = null
  let bestPenalty = Number.POSITIVE_INFINITY

  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = cloneMatrix(baseModules)
    applyMask(candidate, isFunction, mask)
    drawFormatBits(candidate, mask)

    const penalty = penaltyScore(candidate)

    if (penalty < bestPenalty) {
      bestPenalty = penalty
      bestModules = candidate
    }
  }

  return {
    modules: bestModules,
    size: bestModules.length,
  }
}

export function qrPath(modules, border = 4) {
  const parts = []

  modules.forEach((row, y) => {
    row.forEach((isDark, x) => {
      if (isDark) {
        parts.push(`M${x + border} ${y + border}h1v1h-1z`)
      }
    })
  })

  return parts.join('')
}
