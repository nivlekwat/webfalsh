// hanzi → toneless pinyin lookup, scoped to our deck's syllables + the most
// common homophones a Mandarin STT engine is likely to return for those
// pronunciations. Used for forgiving pronunciation matching.
window.PINYIN_DICT = {
  // jia (家)
  "家": "jia", "加": "jia", "假": "jia", "价": "jia", "架": "jia", "嘉": "jia", "佳": "jia", "夹": "jia", "驾": "jia",
  // xue (学)
  "学": "xue", "雪": "xue", "血": "xue", "穴": "xue", "靴": "xue", "削": "xue",
  // shi (石, 十, 师)
  "石": "shi", "十": "shi", "师": "shi", "是": "shi", "时": "shi", "实": "shi", "食": "shi", "史": "shi",
  "试": "shi", "市": "shi", "始": "shi", "视": "shi", "失": "shi", "识": "shi", "事": "shi", "世": "shi",
  "适": "shi", "拾": "shi", "室": "shi", "使": "shi", "似": "shi", "士": "shi", "示": "shi",
  // huo (火)
  "火": "huo", "货": "huo", "活": "huo", "或": "huo", "伙": "huo", "获": "huo", "祸": "huo",
  // tu (土)
  "土": "tu", "图": "tu", "突": "tu", "涂": "tu", "兔": "tu", "徒": "tu", "途": "tu", "吐": "tu",
  // tian (田, 天)
  "田": "tian", "天": "tian", "添": "tian", "甜": "tian", "填": "tian", "舔": "tian",
  // ba (爸, 八)
  "爸": "ba", "把": "ba", "八": "ba", "巴": "ba", "吧": "ba", "拔": "ba", "罢": "ba", "霸": "ba", "坝": "ba",
  // ma (妈, 马)
  "妈": "ma", "马": "ma", "麻": "ma", "吗": "ma", "嘛": "ma", "骂": "ma", "玛": "ma", "抹": "ma", "蚂": "ma",
  // jie (姐)
  "姐": "jie", "接": "jie", "街": "jie", "解": "jie", "节": "jie", "介": "jie", "借": "jie", "杰": "jie",
  "阶": "jie", "界": "jie", "戒": "jie", "届": "jie", "揭": "jie", "皆": "jie", "捷": "jie",
  // mei (妹)
  "妹": "mei", "美": "mei", "没": "mei", "每": "mei", "媒": "mei", "玫": "mei", "煤": "mei", "霉": "mei", "眉": "mei", "梅": "mei",
  // ren (人)
  "人": "ren", "认": "ren", "任": "ren", "仁": "ren", "忍": "ren", "韧": "ren", "刃": "ren", "仍": "ren",
  // tou (头)
  "头": "tou", "偷": "tou", "投": "tou", "透": "tou",
  // shou (手)
  "手": "shou", "收": "shou", "受": "shou", "守": "shou", "寿": "shou", "售": "shou", "兽": "shou", "首": "shou", "瘦": "shou", "授": "shou",
  // jiao (脚)
  "脚": "jiao", "叫": "jiao", "角": "jiao", "教": "jiao", "较": "jiao", "焦": "jiao", "交": "jiao", "觉": "jiao", "浇": "jiao", "骄": "jiao",
  // kou (口)
  "口": "kou", "扣": "kou", "寇": "kou", "抠": "kou",
  // er (耳, 二)
  "耳": "er", "二": "er", "而": "er", "儿": "er", "尔": "er", "饵": "er", "洱": "er",
  // hua (花)
  "花": "hua", "化": "hua", "华": "hua", "划": "hua", "画": "hua", "话": "hua", "滑": "hua",
  // yuan (园)
  "园": "yuan", "元": "yuan", "圆": "yuan", "缘": "yuan", "远": "yuan", "怨": "yuan", "援": "yuan", "院": "yuan", "原": "yuan", "员": "yuan", "源": "yuan", "愿": "yuan",
  // niu (牛)
  "牛": "niu", "扭": "niu", "纽": "niu",
  // yang (羊)
  "羊": "yang", "阳": "yang", "杨": "yang", "央": "yang", "洋": "yang", "仰": "yang", "养": "yang", "痒": "yang", "样": "yang", "氧": "yang",
  // gou (狗)
  "狗": "gou", "够": "gou", "沟": "gou", "钩": "gou", "苟": "gou", "购": "gou", "构": "gou",
  // niao (鸟)
  "鸟": "niao", "尿": "niao", "袅": "niao",
  // chong (虫)
  "虫": "chong", "重": "chong", "充": "chong", "冲": "chong", "崇": "chong", "宠": "chong",
  // shui (水)
  "水": "shui", "谁": "shui", "睡": "shui", "税": "shui", "帅": "shui",
  // yi (一)
  "一": "yi", "衣": "yi", "医": "yi", "依": "yi", "易": "yi", "异": "yi", "仪": "yi", "已": "yi", "以": "yi",
  "移": "yi", "椅": "yi", "议": "yi", "意": "yi", "益": "yi", "翼": "yi", "艺": "yi", "译": "yi", "亿": "yi",
  // san (三)
  "三": "san", "散": "san", "伞": "san",
  // si (四)
  "四": "si", "死": "si", "思": "si", "寺": "si", "私": "si", "司": "si", "似": "si", "丝": "si", "撕": "si", "肆": "si",
  // wu (五)
  "五": "wu", "午": "wu", "物": "wu", "误": "wu", "雾": "wu", "屋": "wu", "武": "wu", "舞": "wu", "务": "wu", "无": "wu",
  // liu (六)
  "六": "liu", "流": "liu", "留": "liu", "柳": "liu", "刘": "liu", "浏": "liu",
  // qi (七)
  "七": "qi", "期": "qi", "棋": "qi", "起": "qi", "气": "qi", "妻": "qi", "戚": "qi", "漆": "qi", "凄": "qi", "启": "qi",
  "弃": "qi", "器": "qi", "企": "qi", "旗": "qi", "齐": "qi", "其": "qi",
  // jiu (九)
  "九": "jiu", "久": "jiu", "酒": "jiu", "旧": "jiu", "究": "jiu", "救": "jiu", "玖": "jiu", "就": "jiu",
  // bai (百)
  "百": "bai", "白": "bai", "摆": "bai", "败": "bai", "拜": "bai", "柏": "bai",
  // lao (老)
  "老": "lao", "牢": "lao", "劳": "lao", "涝": "lao", "唠": "lao",
  // tong (同)
  "同": "tong", "通": "tong", "痛": "tong", "桶": "tong", "童": "tong", "铜": "tong", "统": "tong", "筒": "tong",
  // duo (多)
  "多": "duo", "朵": "duo", "躲": "duo", "堕": "duo", "舵": "duo",
  // shao (少)
  "少": "shao", "烧": "shao", "哨": "shao", "稍": "shao", "邵": "shao", "勺": "shao", "绍": "shao",
  // xiao (小)
  "小": "xiao", "笑": "xiao", "校": "xiao", "效": "xiao", "哮": "xiao", "销": "xiao", "肖": "xiao", "萧": "xiao",
  // yue (月)
  "月": "yue", "越": "yue", "阅": "yue", "跃": "yue", "约": "yue", "钥": "yue", "悦": "yue", "乐": "yue", "岳": "yue",
  // shan (山)
  "山": "shan", "衫": "shan", "闪": "shan", "扇": "shan", "善": "shan",
  // ri (日)
  "日": "ri",
  // mu (木)
  "木": "mu", "母": "mu", "目": "mu", "暮": "mu", "牧": "mu", "募": "mu", "慕": "mu", "模": "mu", "墓": "mu", "沐": "mu", "幕": "mu",
  // shang (上)
  "上": "shang", "商": "shang", "尚": "shang", "伤": "shang", "赏": "shang",
  // xia (下)
  "下": "xia", "夏": "xia", "吓": "xia", "厦": "xia", "暇": "xia",
  // chu (出)
  "出": "chu", "厨": "chu", "触": "chu", "处": "chu", "楚": "chu", "储": "chu", "除": "chu", "初": "chu", "雏": "chu",
  // ru (入)
  "入": "ru", "如": "ru", "乳": "ru", "辱": "ru", "儒": "ru", "茹": "ru",
  // zou (走)
  "走": "zou", "揍": "zou", "邹": "zou", "奏": "zou",
  // li (立)
  "立": "li", "力": "li", "利": "li", "历": "li", "厉": "li", "例": "li", "离": "li", "礼": "li", "理": "li", "里": "li", "厘": "li", "梨": "li", "莉": "li", "丽": "li",
  // Common particles and connectors a child / STT might add
  "的": "de", "了": "le", "在": "zai", "有": "you", "这": "zhe", "那": "na",
  "我": "wo", "你": "ni", "他": "ta", "她": "ta", "它": "ta", "们": "men",
  "不": "bu", "和": "he", "也": "ye", "都": "dou", "就": "jiu", "还": "hai",
  "好": "hao", "大": "da", "对": "dui", "看": "kan", "去": "qu", "来": "lai",
  "啊": "a", "啦": "la", "哦": "o", "呢": "ne", "嗯": "en"
};
