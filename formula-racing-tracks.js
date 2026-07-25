(() => {
  "use strict";

  const SEGMENT_LENGTH = 180;

  const THEMES = Object.freeze({
    ocean:{skyTop:"#071f3a",skyBottom:"#56b6d6",groundA:"#163c43",groundB:"#102d35",roadA:"#343b43",roadB:"#2b3138",rumbleA:"#f0c351",rumbleB:"#f5f5f2",accent:"#5ee7ff",scenery:"ocean"},
    volcanic:{skyTop:"#2a0710",skyBottom:"#e35a31",groundA:"#291316",groundB:"#190d10",roadA:"#3b3638",roadB:"#2e292b",rumbleA:"#ff6649",rumbleB:"#f7d36a",accent:"#ff6f4d",scenery:"volcano"},
    harbour:{skyTop:"#09172a",skyBottom:"#4f89af",groundA:"#1b313a",groundB:"#12262f",roadA:"#3b4148",roadB:"#30353b",rumbleA:"#f6f6f4",rumbleB:"#db3434",accent:"#7bd9ff",scenery:"harbour"},
    neon:{skyTop:"#09071c",skyBottom:"#4a185e",groundA:"#171428",groundB:"#0d0c17",roadA:"#302d3b",roadB:"#272431",rumbleA:"#e755ff",rumbleB:"#47e8ff",accent:"#ff66df",scenery:"neon"},
    desert:{skyTop:"#673313",skyBottom:"#f4b35d",groundA:"#8b5329",groundB:"#6f3f20",roadA:"#4a423c",roadB:"#3c3631",rumbleA:"#fff1c1",rumbleB:"#d24f2d",accent:"#ffd06a",scenery:"desert"},
    forest:{skyTop:"#071c19",skyBottom:"#6ea27e",groundA:"#153c2c",groundB:"#0e2f22",roadA:"#363d3a",roadB:"#2d3330",rumbleA:"#f4f4ef",rumbleB:"#d9463f",accent:"#7de39c",scenery:"forest"},
    snow:{skyTop:"#7ca4c6",skyBottom:"#e9f5ff",groundA:"#d9ecf5",groundB:"#bed6e2",roadA:"#444c54",roadB:"#394149",rumbleA:"#f8fbff",rumbleB:"#4c83b5",accent:"#c9f4ff",scenery:"snow"},
    sunset:{skyTop:"#27113f",skyBottom:"#f07355",groundA:"#493227",groundB:"#35241e",roadA:"#3e3837",roadB:"#332e2d",rumbleA:"#fff0be",rumbleB:"#e24743",accent:"#ffb86b",scenery:"sunset"},
    city:{skyTop:"#111825",skyBottom:"#5f7891",groundA:"#242e36",groundB:"#192129",roadA:"#3c4147",roadB:"#30353a",rumbleA:"#f7f7f5",rumbleB:"#df3a3a",accent:"#8bd4ff",scenery:"city"},
    final:{skyTop:"#120b1f",skyBottom:"#745020",groundA:"#26211a",groundB:"#17140f",roadA:"#3d3931",roadB:"#302d28",rumbleA:"#e8bd4e",rumbleB:"#111111",accent:"#f0c75a",scenery:"final"}
  });

  const make = (id,name,location,difficulty,lengthKm,theme,signature,tagline) => ({
    id,name,location,difficulty,lengthKm,theme,signature,tagline,
    laps:5
  });

  // Signature format: [segment count, curve strength, hill strength]
  // The renderer converts these signatures into 25 clearly different forward-view circuits.
  const TRACKS = Object.freeze([
    make("oruc-coastal","Oruç Reis Coastal Circuit","Karadeniz Kıyısı",2,4.8,"ocean",[[42,0,0],[26,.35,.08],[20,-.55,.18],[34,0,-.06],[24,.82,.12],[18,-.9,-.08],[38,.12,0]],"Deniz kıyısında hızlı ve akıcı açılış pisti."),
    make("dragon-pass","Dragon Mountain Pass","Volkan Sırtı",4,5.2,"volcanic",[[24,.72,.22],[18,-1.05,.28],[22,.96,-.24],[28,-.48,.18],[20,1.18,.30],[18,-1.28,-.25],[34,.25,0]],"Keskin virajlar ve sürekli yükselen sıcak asfalt."),
    make("filyos-harbour","Filyos Harbour Run","Filyos Limanı",3,4.4,"harbour",[[40,0,0],[18,.82,0],[16,-.92,.05],[26,.18,0],[20,-.64,0],[16,.78,-.06],[38,0,0]],"Liman duvarları arasında frenleme ve ritim sınavı."),
    make("bosphorus-night","Bosphorus Night Drive","İstanbul Boğazı",3,5.0,"neon",[[34,.20,.05],[22,-.78,.10],[24,.66,-.08],[30,-.18,.02],[18,1.02,.15],[18,-1.08,-.14],[40,.08,0]],"Gece ışıkları altında uzun akış ve teknik son sektör."),
    make("anatolian-speed","Anatolian Speed Loop","Anadolu Platosu",2,5.8,"desert",[[58,0,.03],[22,.35,.05],[48,-.12,-.02],[20,.55,.08],[52,0,0],[18,-.62,-.04]],"Yüksek hız, geç fren ve minimum direksiyon hareketi."),
    make("black-sea-storm","Black Sea Storm Road","Karadeniz Fırtına Hattı",4,5.1,"ocean",[[24,-.45,.16],[22,.92,.22],[18,-1.12,-.20],[30,.54,.18],[20,-.86,-.16],[26,.28,.08],[30,-.12,0]],"Dalgalı yükseklikler ve kör virajlar."),
    make("med-sunset","Mediterranean Sunset GP","Akdeniz Sahili",2,4.9,"sunset",[[36,.18,.03],[26,.48,.10],[30,-.52,-.08],[34,.16,.04],[24,-.72,.12],[22,.64,-.10],[32,0,0]],"Gün batımında geniş virajlar ve temiz çizgi."),
    make("champion-valley","Champion Valley Circuit","Şampiyonlar Vadisi",3,5.3,"final",[[32,.52,.15],[20,-.78,.18],[28,.26,-.10],[22,.94,.20],[18,-1.04,-.22],[30,.42,.10],[34,-.16,0]],"Altın vadide dengeli sürücüyü ödüllendiren pist."),
    make("golden-horn","Golden Horn Street","Haliç",4,4.2,"city",[[24,0,0],[14,.95,0],[16,-1.15,.04],[20,.72,0],[14,-.92,0],[18,1.08,.03],[28,-.18,0]],"Dar sokaklarda milimetrik direksiyon kontrolü."),
    make("cappadocia-ridge","Cappadocia Ridge","Kapadokya",3,5.4,"desert",[[28,.35,.24],[24,-.58,.30],[22,.84,-.26],[34,-.22,.18],[20,-.88,-.20],[28,.66,.14],[32,0,-.06]],"Peribacaları arasında yükselip alçalan teknik rota."),
    make("taurus-alpine","Taurus Alpine Route","Toros Dağları",5,5.0,"forest",[[18,.86,.34],[18,-1.12,.38],[16,1.22,-.34],[20,-1.28,.30],[22,.74,-.26],[18,-.96,.24],[30,.20,-.12]],"25 pist içindeki en sert dağ mücadelesi."),
    make("aegean-cliffs","Aegean Cliffside","Ege Kıyıları",3,5.1,"sunset",[[34,-.34,.12],[26,.62,.18],[22,-.74,-.15],[38,.18,.08],[20,.92,.16],[22,-.84,-.12],[28,0,0]],"Uçurum kıyısında uzun görüş ve ani yön değişimleri."),
    make("izmir-marina","İzmir Marina Sprint","İzmir",2,4.3,"harbour",[[38,0,0],[20,.62,.03],[18,-.68,0],[32,.14,0],[20,-.48,.02],[16,.58,0],[36,0,0]],"Hızlı turlar ve sıralama rekorları için ideal."),
    make("capital-ring","Capital Ring","Ankara",3,5.6,"city",[[46,.12,.05],[24,-.46,.08],[30,.58,-.06],[40,0,.02],[20,.78,.10],[22,-.72,-.08],[34,.18,0]],"Geniş bulvarlar ve güçlü orta sektör."),
    make("pamukkale-white","Pamukkale White Road","Denizli",3,4.7,"snow",[[28,.46,.18],[22,-.64,.12],[24,.82,-.16],[30,-.36,.10],[20,-.92,-.14],[26,.54,.08],[30,.12,0]],"Beyaz teraslar boyunca kontrastı yüksek teknik pist."),
    make("nemrut-summit","Nemrut Summit Challenge","Adıyaman",4,5.2,"desert",[[24,.62,.32],[20,-.94,.38],[26,.78,.22],[18,-1.10,-.34],[24,.98,-.24],[28,-.46,.16],[30,.12,-.08]],"Zirveye çıkış ve frenlerde ağırlık transferi."),
    make("sakarya-forest","Sakarya Forest Circuit","Sakarya",3,5.0,"forest",[[30,-.28,.10],[24,.74,.16],[18,-.86,-.12],[28,.56,.14],[24,-.72,-.10],[34,.22,.06],[28,0,0]],"Ağaç tünellerinde ritmik viraj kombinasyonları."),
    make("thrace-wind","Thrace Wind Circuit","Trakya",2,5.7,"forest",[[52,0,.04],[28,.32,.08],[40,-.20,-.05],[26,.44,.06],[42,0,0],[22,-.52,-.04]],"Rüzgârlı düzlükler ve cesur yüksek hız geçişleri."),
    make("mersin-heatway","Mersin Heatway","Mersin",3,5.4,"desert",[[40,.08,.03],[24,.68,.10],[20,-.82,-.08],[36,.20,.04],[22,-.58,.12],[24,.74,-.10],[34,0,0]],"Sıcak zeminde dengeli gaz kullanımı."),
    make("cyprus-island","Cyprus Island Run","Kıbrıs",3,5.1,"ocean",[[32,.38,.10],[24,-.66,.14],[28,.48,-.10],[20,-.92,.12],[22,.86,-.14],[30,-.28,.08],[34,.12,0]],"Ada kıyısında hızlı ama hata affetmeyen rota."),
    make("frostline","Frostline Challenge","Kuzey Hattı",4,4.9,"snow",[[26,-.52,.20],[20,.88,.26],[22,-1.02,-.22],[24,.76,.18],[18,-.96,-.20],[28,.42,.10],[34,0,-.05]],"Soğuk atmosferde dar görüş ve keskin apexler."),
    make("desert-crown","Desert Crown Circuit","Çöl Krallığı",3,6.0,"desert",[[64,0,.02],[22,.42,.08],[50,-.16,-.03],[18,.92,.12],[46,0,0],[20,-.72,-.06]],"En uzun düzlük ve en yüksek son hız potansiyeli."),
    make("neon-metro","Neon Metro Circuit","Gece Metropolü",4,4.6,"neon",[[22,.78,.04],[16,-1.02,0],[18,.94,.02],[20,-.86,0],[24,.62,.04],[18,-.96,-.03],[30,.18,0]],"Neon bariyerlerde hızlı refleks ve yakın kontrol."),
    make("volcano-edge","Volcano Edge","Ateş Çemberi",5,5.3,"volcanic",[[20,1.02,.28],[18,-1.22,.34],[20,1.30,-.30],[18,-1.18,.26],[22,.92,-.22],[22,-.78,.18],[30,.24,-.10]],"Aşırı yön değişimleriyle ustalık pisti."),
    make("final-chapter","Final Chapter Circuit","Eternal Arena",5,5.8,"final",[[34,.42,.10],[22,-.72,.18],[20,1.02,-.14],[24,-1.12,.20],[28,.62,-.16],[20,-.94,.14],[36,.26,.06],[30,0,0]],"25 pistlik yolculuğun büyük finali.")
  ]);

  function getTrack(id) {
    return TRACKS.find(track => track.id === id) || TRACKS[0];
  }

  function buildSegments(trackOrId) {
    const track = typeof trackOrId === "string" ? getTrack(trackOrId) : trackOrId;
    const segments = [];
    let elevation = 0;
    let index = 0;

    track.signature.forEach(([count,curve,hill]) => {
      const safeCount = Math.max(4, Math.round(count));
      for (let i = 0; i < safeCount; i += 1) {
        const phase = safeCount <= 1 ? 1 : i / (safeCount - 1);
        const ease = Math.sin(Math.PI * phase);
        elevation += Number(hill || 0) * ease * 0.55;
        segments.push({
          index:index++,
          curve:Number(curve || 0) * (0.42 + ease * 0.58),
          hill:Number(hill || 0) * ease,
          elevation,
          stripe:Math.floor(index / 3) % 2
        });
      }
    });

    return segments;
  }

  window.F1_TRACKS = Object.freeze({
    TRACKS,
    THEMES,
    SEGMENT_LENGTH,
    getTrack,
    buildSegments
  });
})();
