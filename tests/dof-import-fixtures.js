// PWA Commit 3B -- yalnız test yardımcıları. Gerçek Desktop (isg_denetim)
// `dof_disa_aktar()` sözleşmesine göre kurgulanmış, SENTETİK (gerçek kişi/
// kurum verisi İÇERMEYEN) örnek paketler üretir. Alan adları/şekli
// isg_denetim/dof_islemleri.py (`dof_disa_aktar`, satır ~838-1073) ve
// isg_denetim/dof_replay_state.py salt-okunur incelenerek doğrulanmıştır --
// tahmin edilmemiştir.

/** Sabit, biçimi geçerli ama rastgele olmayan (test kararlılığı için) bir
 * UUID v4 metni üretir -- basit sayaç tabanlı, çakışmasız. */
let _sayac = 0;
function sentetikUuidV4() {
  _sayac += 1;
  const n = String(_sayac).padStart(12, '0');
  return `00000000-0000-4000-8000-${n}`;
}

/** Biçimi geçerli (64 haneli lowercase hex) ama gerçek SHA-256 olmayan
 * sentetik bir `baseStateHash` üretir -- yalnız REGEX doğrulaması test
 * edildiği için kriptografik gerçeklik gerekmez. */
function sentetikHash64() {
  _sayac += 1;
  const taban = _sayac.toString(16).padStart(8, '0');
  return (taban + 'a').repeat(8).slice(0, 64);
}

/** Gerçek Desktop export kaydı şeklinde TEK bir "tehlike" kaydı üretir.
 * `dof_islemleri.py:938-990` alan adlarıyla birebir eşleşir. */
function gecerliDofKaydi(overrides = {}) {
  return {
    dofId: 1,
    bulguKodu: 'B-1',
    riskKodu: 'B-1-01',
    tehlikeNo: 1,
    pwaKurumId: 'kurum-sentetik-1',
    pwaBirimId: 'birim-sentetik-1',
    pwaOdaId: null,
    kat: '1',
    oda: '101',
    alanTipi: 'Elektrik',
    tehlikeTanimi: 'Açık pano',
    riskDuzeyi: 'Düşük Risk',
    r: 63,
    duzelticiFaaliyet: 'Kapak kapatılmalı',
    aksiyonSuresi: 'derhal',
    dofUuid: sentetikUuidV4(),
    exportUuid: sentetikUuidV4(),
    replayVersion: 2,
    baseStateHash: sentetikHash64(),
    aktifTurSirasi: 1,
    ...overrides,
  };
}

/** Gerçek Desktop export paketi şeklinde ("isg_dof_paketi") tam bir paket
 * üretir. `tehlikelerOverride` verilmezse iki sentetik-ama-gerçekçi kayıt
 * içerir (biri null konum alanlarıyla, biri dolu). */
function gecerliDofPaketi({ paketUuid = null, tehlikelerOverride = null } = {}) {
  const tehlikeler = tehlikelerOverride ?? [
    gecerliDofKaydi({ dofId: 1, bulguKodu: 'B-1', tehlikeNo: 1 }),
    gecerliDofKaydi({
      dofId: 2, bulguKodu: 'B-2', tehlikeNo: 2,
      pwaKurumId: null, pwaBirimId: null, pwaOdaId: null,
      riskKodu: null, riskDuzeyi: null, r: null,
    }),
  ];
  return {
    tur: 'isg_dof_paketi',
    surum: 1,
    paketUuid: paketUuid ?? sentetikUuidV4(),
    olusturma: new Date().toISOString(),
    kaynak: 'isg_denetim_masaustu',
    tehlikeler,
  };
}

module.exports = { sentetikUuidV4, sentetikHash64, gecerliDofKaydi, gecerliDofPaketi };
