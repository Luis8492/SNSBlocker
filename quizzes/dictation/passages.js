// 書き取りクイズのデータ（古典文学）。
// 各作品は「一続きの文章」を3つの segment に分けて出題する。
// segment は覚えるのがそれなりに大変な長さにしてある。
// dictation.js から Kansho.data.dictationPassages として参照される。
//
// 作品や分割はここを編集すれば自由に追加・変更できる（基盤には影響しない）。
(function () {
  "use strict";

  var K = window.Kansho || (window.Kansho = {});
  K.data = K.data || {};

  K.data.dictationPassages = [
    {
      title: "徒然草・序段",
      author: "吉田兼好",
      lang: "ja",
      segments: [
        "つれづれなるままに、日暮らし、硯にむかひて、",
        "心にうつりゆくよしなし事を、そこはかとなく書きつくれば、",
        "あやしうこそものぐるほしけれ。"
      ]
    },
    {
      title: "方丈記・冒頭",
      author: "鴨長明",
      lang: "ja",
      segments: [
        "ゆく河の流れは絶えずして、しかももとの水にあらず。",
        "よどみに浮かぶうたかたは、かつ消えかつ結びて、久しくとどまりたるためしなし。",
        "世の中にある人とすみかと、またかくのごとし。"
      ]
    },
    {
      title: "枕草子・春はあけぼの",
      author: "清少納言",
      lang: "ja",
      segments: [
        "春はあけぼの。やうやう白くなりゆく山ぎは、少しあかりて、紫だちたる雲の細くたなびきたる。",
        "夏は夜。月のころはさらなり、闇もなほ、蛍の多く飛びちがひたる。",
        "また、ただ一つ二つなど、ほのかにうち光りて行くもをかし。雨など降るもをかし。"
      ]
    },
    {
      title: "平家物語・祇園精舎",
      author: "作者未詳",
      lang: "ja",
      segments: [
        "祇園精舎の鐘の声、諸行無常の響きあり。",
        "沙羅双樹の花の色、盛者必衰の理をあらはす。おごれる人も久しからず、ただ春の夜の夢のごとし。",
        "たけき者も遂にはほろびぬ、ひとへに風の前の塵に同じ。"
      ]
    },
    {
      title: "論語・学而",
      author: "孔子",
      lang: "ja",
      segments: [
        "学びて時に之を習ふ、亦説ばしからずや。",
        "朋あり遠方より来る、亦楽しからずや。",
        "人知らずして慍らず、亦君子ならずや。"
      ]
    },
    {
      title: "Hamlet, Act III",
      author: "William Shakespeare",
      lang: "en",
      segments: [
        "To be, or not to be, that is the question:",
        "Whether 'tis nobler in the mind to suffer the slings and arrows of outrageous fortune,",
        "or to take arms against a sea of troubles, and by opposing end them."
      ]
    },
    {
      title: "The Prince, Chapter XVII",
      author: "Niccolo Machiavelli",
      lang: "en",
      segments: [
        "Upon this a question arises: whether it be better to be loved than feared, or feared than loved?",
        "It may be answered that one should wish to be both, but, because it is difficult to unite them in one person,",
        "it is much safer to be feared than loved, when, of the two, either must be dispensed with."
      ]
    }
  ];
})();
