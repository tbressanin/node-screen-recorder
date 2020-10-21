import { recordScreen } from './recorder';

const recording = recordScreen('./test.mp4', {
  fps: 10,
  resolution: 3286 + '' + 'x1080',
  pixelFormat: 'yuv420p',
  videoCodec: 'h264',
  format: 'mp4'
})

// Record for 5seconds (file test.mp4)
setTimeout(() => recording.stop(), 5000)