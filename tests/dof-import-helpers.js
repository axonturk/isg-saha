// PWA Commit 3B -- yalnız test yardımcısı. `window._dofImport.
// dofPaketiIceriAktar` gerçek üretim fonksiyonunu çağırır; hata fırlatırsa
// (DofImportHatasi) Playwright sınır ötesine (`page.evaluate` -> Node)
// özel `.kod` alanını GÜVENİLİR biçimde taşımadığından, sayfa içinde
// try/catch ile serileştirilebilir bir sonuca çevrilir.
async function dofIceriAktarDene(page, paketVeyaJsonMetni) {
  return page.evaluate(async (p) => {
    try {
      const sonuc = await window._dofImport.dofPaketiIceriAktar(p);
      return { basarili: true, sonuc };
    } catch (e) {
      return { basarili: false, kod: e && e.kod, mesaj: e && e.message };
    }
  }, paketVeyaJsonMetni);
}

module.exports = { dofIceriAktarDene };
