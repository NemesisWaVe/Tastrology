# Sound palette

Everything is synthesized with WebAudio (`lib/soundEngine.ts`); call sites use `sfx(name, {i, gain})` from `lib/sound.ts`.
Off by default, toggled by `SoundToggle` (nav), remembered in `localStorage["tastrology:sound"]`. The context only
resumes on a user gesture. Master gain 0.35 into a gentle compressor; a shared 1.4s generated-noise reverb.

## Principles
- Soft transients (3-8ms attack, never instant), exponential decays, no harsh highs (noise is low-passed or band-limited).
- Pentatonic pitches only, so overlapping sounds never clash.
- Sine/triangle bodies, a touch of filtered noise for texture; small random stereo pan; reverb send for "glass/air".
- Short: UI sounds under 150ms, moments 0.4-1.8s. Repeats throttled (tick 40ms, tap 60ms, ripple 50ms, drop 120ms).

## Sounds
| name | recipe | feel | fires |
|---|---|---|---|
| tap | sine 190->110Hz 90ms + bandpassed noise 40ms + faint 880Hz triangle | muted mechanical key | toggle on, VS button, share |
| tick | bandpass noise 2.4kHz, 22ms, random pan | dry micro-click | hold-to-burn 25/50/75% |
| drop | sine 880->330Hz 200ms + 220Hz bloom, wet | water plink | intro (other agent) |
| ripple | pentatonic sine from C5 by `i`, 0.9s, wet, panned + inharmonic partial | glass ting | intro |
| shimmer | bandpass noise sweep 0.6->3kHz over 1.8s + stacked sines | sky swell | intro |
| form | rising pentatonic triangle arpeggio, low-passed + 130Hz pad | stars settling | intro |
| flip | bandpass noise 0.5->2.6kHz 220ms + 150Hz thock | foil swish, soft landing | card flip, common reveal |
| reveal | maj chord C5-E5-G5-C6 staggered, long wet decay + airy highpass | bell shimmer; `gain` scales with rarity | pack reveal |
| burn | noise lowpass 5kHz->180Hz 1.3s + random crackle ticks + sub | embers fading | deck burn |
| collide | 110->38Hz sub boom + noise bloom 3kHz->150Hz + fifth | deep, wide impact | VS first contact |
| whoosh | bandpass noise 0.4->2.4kHz 350ms | air sweep | share sheet, pack take |

Research basis: general UI/ASMR sound-design practice (soft attack, low-passed noise, pentatonic, short decays).
Receipt printer sounds are intentionally separate: they model a thermal register, with their own toggle.
