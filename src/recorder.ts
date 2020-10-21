const fs = require('fs')
const util = require('util')
const { execFile } = require('child_process')
const execFilePromise = util.promisify(execFile)

function buildFFMPEGArgs(fileName: string, options: any = {}) {
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
      : ''
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

export function recordScreen(fileName: string, options: any) {
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
  let recProcess: any;
  /**async
   * Executes the recording process.
   *
   * @param {Function} resolve Success callback
   * @param {Function} reject Failure callback
   */
  function recordingExecutor(resolve: any, reject: any) {
    recProcess = execFile('ffmpeg', args, function (error: any, stdout: any, stderr: any) {
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

  async function setMetadata(result: any) {
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
