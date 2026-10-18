// Thư viện âm thanh của bạn: làm gọn tên file, chia nhóm, nhận ra bản sao.
import { describe, expect, it } from 'vitest'
import { classifySound, cleanSoundName, duplicateKey, isCopyName, uniqueNames } from '@shared/audio/soundLibrary'

const S = 1_000_000

describe('thư viện âm thanh – tên', () => {
  it('bỏ rác trong tên file tải về', () => {
    expect(cleanSoundName('ES_Camera Shutter 1 - SFX Producer(1).mp3')).toBe('Camera Shutter 1')
    expect(cleanSoundName('Y2Mate.is - Pop sound effect--alGcEs7XYo-128k-1655499992662(1).mp3')).toBe('Pop')
    expect(cleanSoundName('Y2Mate.is - DUN DUN DUNNNNN!!  (SOUND EFFECT)DOWNLOAD-_zrMykBnidM-128k-1656469302898.mp3')).toBe(
      'DUN DUN DUNNNNN!!'
    )
    expect(cleanSoundName('Clock_Ticking_Sound_Effect_(getmp3.pro)(1).mp3')).toBe('Clock Ticking')
    expect(cleanSoundName('Shutter Click sound effect (no copyright ).mp3')).toBe('Shutter Click')
    expect(cleanSoundName('birds-in-the-morning-24147(1).mp3')).toBe('Birds in the morning')
    expect(cleanSoundName('MA_Tuttkile_ChaChingCashRegister_1.wav')).toBe('MA Tuttkile Cha Ching Cash Register 1')
    expect(cleanSoundName('[No_Copyright]_Fuzzeke_-_Blue_Shirt_Guy_[Fun_Po.mp3')).toBe('Fuzzeke - Blue Shirt Guy [Fun Po')
    expect(cleanSoundName('Horror_Background_Music_F0_9F_91_BB____Horror_Ringtone____No_Copyright(256k)(1).mp3')).toBe(
      'Horror Background Music Horror Ringtone'
    )
    expect(cleanSoundName('sweat(1).mp3')).toBe('Sweat')
    expect(cleanSoundName('_5BNO_COPYRIGHT_MUSIC_5D_ACTION_CINEMATIC_DYNAM.mp3')).toBe('ACTION CINEMATIC DYNAM')
    // Không còn gì sau khi bỏ rác → giữ tên gốc
    expect(cleanSoundName('Sound Effect.mp3')).toBe('Sound Effect')
  })

  it('bản sao "(1)" cùng dung lượng = trùng; khác dung lượng = file khác', () => {
    expect(duplicateKey('Pop(1).mp3', 100)).toBe(duplicateKey('Pop.mp3', 100))
    expect(duplicateKey('Pop (2).mp3', 100)).toBe(duplicateKey('pop.MP3', 100))
    expect(duplicateKey('Pop(1).mp3', 101)).not.toBe(duplicateKey('Pop.mp3', 100))
    expect(isCopyName('Pop(1).mp3')).toBe(true)
    expect(isCopyName('Gag 01.mp3')).toBe(false)
  })

  it('tên trùng → thêm số', () => {
    expect(uniqueNames([{ name: 'Whoosh' }, { name: 'whoosh' }, { name: 'Pop' }]).map((i) => i.name)).toEqual(['Whoosh', 'whoosh 2', 'Pop'])
  })
})

describe('thư viện âm thanh – nhóm', () => {
  it('theo từ khóa', () => {
    expect(classifySound('Deep woosh', S)).toBe('transition')
    expect(classifySound('Riser Reverse Debris', S)).toBe('transition')
    expect(classifySound('Mouse Click Double 1', S)).toBe('ui')
    expect(classifySound('Keyboard Typing', 5 * S)).toBe('typing')
    expect(classifySound('Camera Whoosh 01', S)).toBe('camera')
    expect(classifySound('Paper_rip_01', S)).toBe('paper')
    expect(classifySound('Surprise Pop', S)).toBe('pop')
    expect(classifySound('Money Count', S)).toBe('money')
    expect(classifySound('Done Bell', S)).toBe('bell')
    expect(classifySound('Comical Duck Quack', S)).toBe('funny')
    expect(classifySound('Epic Shock (Doom)', S)).toBe('tension')
    expect(classifySound('Alfa Fact ! Background Music', 90 * S)).toBe('music')
  })

  it('không khớp từ khóa: dài → nhạc nền, ngắn → khác', () => {
    expect(classifySound('Kazoom - Quincas Moreira', 150 * S)).toBe('music')
    expect(classifySound('AUD-20231211-WA0003', 2 * S)).toBe('other')
    // Tên giống hiệu ứng nhưng dài vài phút → nhạc nền (trừ gõ phím)
    expect(classifySound('levitate', 144 * S)).toBe('music')
    expect(classifySound('typing sound effect 1 min', 100 * S)).toBe('typing')
  })
})
