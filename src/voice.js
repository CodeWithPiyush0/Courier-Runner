// Dispatch's recorded lines. public/vo/manifest.json maps each line's text to
// its mp3 (made by tools/gen_voice.py); lines without a recording stay silent.
// Playback (and the volume/mute settings) is handled by Sound.
export class Voice {
  constructor(sound) {
    this.sound = sound;
    this.files = {};
    fetch('vo/manifest.json')
      .then((res) => (res.ok ? res.json() : {}))
      .then((files) => { this.files = files; })
      .catch(() => {});
  }

  play(text) {
    const file = this.files[text];
    if (file) this.sound.playVoice(file);
  }

  stop() {
    this.sound.stopVoice();
  }
}
