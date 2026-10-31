// The characters' recorded lines. public/vo/manifest.json maps each line's
// text to its mp3 (made by tools/gen_voice.py); lines without a recording stay
// silent. Playback (and the volume/mute settings) is handled by Sound.
export class Voice {
  constructor(sound) {
    this.sound = sound;
    this.files = {};
    this.ready = fetch('vo/manifest.json')
      .then((res) => (res.ok ? res.json() : {}))
      .then((files) => { this.files = files; })
      .catch(() => {});
  }

  has(text) { return Boolean(this.files[text]); }

  // Start downloading lines that are about to be needed (e.g. a cutscene's).
  async preload(texts) {
    await this.ready;
    await Promise.all(texts.filter((t) => this.files[t]).map((t) => this.sound.fetchVoice(this.files[t])));
  }

  // Play a line. Resolves when it has finished (or right away if there's no
  // recording). Low-priority lines (chatter) don't interrupt a line already
  // playing; they are just shown as text.
  play(text, { priority = 'high' } = {}) {
    const file = this.files[text];
    if (!file) return Promise.resolve();
    if (priority === 'low' && this.sound.voiceBusy) return Promise.resolve();
    return this.sound.playVoice(file);
  }

  stop() {
    this.sound.stopVoice();
  }
}
