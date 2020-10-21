const fs = require('fs')
const util = require('util')
const { execFile } = require('child_process')
const execFilePromise = util.promisify(execFile)

function buildFFMPEGArgs(fileName, options = {}) {
  const args = ['-y'] // Override existing files
  if (options.loglevel) {
    args.push('-loglevel', options.loglevel)
  }
  if (options.resolution) {
    // Must match X11 display resolution when using x11grab:
    args.push('-video_size', options.resolution)
  }
  if (options.fps) {
    // Frames per second to record from input:
    args.push('-r', String(options.fps))
  }
  if (options.inputFormat) {
    args.push('-f', options.inputFormat)
  }
  args.push(
    '-i',
    // Construct the input URL:
    options.inputFormat === 'x11grab'
      ? `${options.hostname || ''}:${options.display}`
      : buildURL(options)
  )
  if (options.videoFilter) {
    args.push('-vf', options.videoFilter)
  }
  if (options.videoCodec) {
    args.push('-vcodec', options.videoCodec)
  }
  if (options.pixelFormat) {
    args.push('-pix_fmt', options.pixelFormat)
  }
  args.push(fileName)
  return args
}

function recordScreen(fileName, options) {
  const args = buildFFMPEGArgs(
    fileName,
    Object.assign(
      {
        inputFormat: 'x11grab',
        fps: 15,
        pixelFormat: 'yuv420p', // QuickTime compatibility
        display: '0',
        port: 9000
      },
      options
    )
  )
  let recProcess
  /**async
   * Executes the recording process.
   *
   * @param {Function} resolve Success callback
   * @param {Function} reject Failure callback
   */
  function recordingExecutor(resolve, reject) {
    recProcess = execFile('ffmpeg', args, function (error, stdout, stderr) {
      recProcess = null
      // ffmpeg returns with status 255 when receiving SIGINT:
      if (error && !(error.killed && error.code === 255)) return reject(error)
      return resolve({ stdout, stderr })
    })
  }
  /**
   * Stops the recording process.
   */
  function stop() {
    if (recProcess) recProcess.kill('SIGINT')
  }
  /**async
   * Sets meta data on the recorded video.
   *
   * @param {Result} result Recording result object
   * @returns {Promise<Result>} Resolves with a recording result object
   */

  async function setMetadata(result) {
    if (!options.rotate) return Promise.resolve(result)
    // Metadata cannot be set when encoding, as the FFmpeg MP4 muxer has a bug
    // that prevents changing metadata: https://trac.ffmpeg.org/ticket/6370
    // So we set the metadata in a separate command execution:
    const tmpFileName = fileName.replace(/[^.]+$/, 'tmp.$&')
    const args = [
      '-y',
      '-loglevel',
      'error',
      'video="gdigrab"',
      '-i',
      fileName,
      '-codec',
      'copy',
      '-map_metadata',
      ':0',
      '-metadata:s:v',
      'rotate=' + options.rotate,
      tmpFileName
    ];
    return execFilePromise('ffmpeg', args).then(function () {
      fs.unlinkSync(fileName)
      fs.renameSync(tmpFileName, fileName)
      return result
    })
  }
  const promise = new Promise(recordingExecutor).then(setMetadata)
  return { promise, stop }
}

const recording = recordScreen('./test.mp4', {
  fps: 10,
  resolution: 3286+'' + 'x1080',
  pixelFormat: 'yuv420p',
  videoCodec: 'h264',
  format: 'mp4'
})

recording.promise
  .then(result => {
    // Screen recording is done
    process.stdout.write(result.stdout)
    process.stderr.write(result.stderr)
  })
  .catch(error => {
    // Screen recording has failed
    console.error(error)
  })

// As an example, stop the screen recording after 5 seconds:
setTimeout(() => recording.stop(), 5000)