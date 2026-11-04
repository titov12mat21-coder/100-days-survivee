export class Audio {
  constructor(){ this.ctx = null; }
  init(){
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext||window.webkitAudioContext)(); } catch(e){}
  }
  _tone(freq, dur=0.1, type='sine', vol=0.1){
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(); o.stop(this.ctx.currentTime + dur);
  }
  hit(){ this._tone(150, 0.1, 'square', 0.15); }
  gather(){ this._tone(400, 0.08, 'triangle', 0.12); }
  hurt(){ this._tone(100, 0.2, 'sawtooth', 0.2); }
  craft(){ this._tone(600, 0.1, 'sine', 0.1); setTimeout(()=>this._tone(800, 0.12, 'sine', 0.1), 100); }
  jump(){ this._tone(300, 0.1, 'sine', 0.08); }
  death(){ this._tone(80, 0.6, 'sawtooth', 0.25); }
  event(){ this._tone(200, 0.5, 'square', 0.15); setTimeout(()=>this._tone(300, 0.4, 'square', 0.15), 200); }
}