#!/usr/bin/env python3
# 60 张带分卡 manifest（一致性版）：
#  L1/L2 立绘按「宝石色+主题」keyed，同名必同图；名字色=折扣色=立绘色
#  L3=真实传奇珠宝名+真实典故+每张专属立绘
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
CARDS = json.load(open(os.path.join(HERE, "vp_cards.json")))

GEM_ADJ = {"ruby": "crimson red", "sapphire": "deep royal blue", "emerald": "vivid green",
           "diamond": "brilliant icy white", "onyx": "glossy jet-black"}
GEM_EN = {"ruby": "ruby", "sapphire": "sapphire", "emerald": "emerald",
          "diamond": "diamond", "onyx": "black onyx"}

# 主题词 -> (英文slug, 画面场景)
NOUN = {
    "探方": ("excavation", "an archaeological excavation grid cut into stone with exposed gem seams"),
    "矿脉": ("orevein", "a glittering ore vein threaded with raw gems inside a rock wall"),
    "竖井": ("shaft", "a deep timbered mine shaft descending into glowing rock"),
    "晶洞": ("geode", "a cracked geode revealing a hollow lined with crystals"),
    "采石场": ("quarry", "an open quarry terraced into a hillside with cut blocks and tools"),
    "矿坑": ("pit", "an open mine pit with rubble and scattered raw gems"),
    "砂矿": ("placer", "a riverside placer mine with gem-bearing gravel and pans"),
    "工坊": ("workshop", "an artisan workshop bench with lathes, files and a half-set gem"),
    "商会": ("guild", "a grand merchant guild hall with banners and a long meeting table"),
    "货栈": ("warehouse", "a vaulted warehouse stacked with crates, barrels and sealed goods"),
    "拍卖行": ("auction", "an auction house podium under a lamp with a gem on velvet up for bid"),
    "雕琢室": ("lapidary", "a lapidary studio with a faceting machine and a glowing cut gem"),
    "商队": ("caravan", "a gem-laden caravan of camels resting at a desert oasis at dusk"),
    "银号": ("bank", "a vaulted bank exchange with brass scales, ledgers and stacked coin"),
    "铺面": ("shop", "a jewel merchant shopfront with a lit window display of gems"),
}

MYTH = {
    "ruby": "红宝石古称「宝石之王」，被视作大地之心的火焰，血色寓生命与激情，古时战士佩之以求战场免伤。",
    "sapphire": "蓝宝石是「天国之石」，古波斯人相信大地浮于一块巨蓝宝石之上，天空遂成湛蓝，象征智慧与诚实。",
    "emerald": "翡翠乃「维纳斯之石」，埃及艳后克娄巴特拉为其痴迷，代表重生、春天与希望。",
    "diamond": "钻石源自诸神不朽之碎片，亦是梵天之眼、丘比特的箭镞，「坚不可摧」，象征永恒与纯净。",
    "onyx": "玛瑙为护身辟邪之石，古希腊奉为冥王护身之石，层理如命运纹路，能凝神定气。",
}

# L3 真实传奇珠宝（id -> (名, 典故, 画面主体)）
L3 = {
    70: ("希望钻石", "45 克拉深蓝名钻，自法国王室辗转入藏史密森尼；传说「携带者皆遭厄运」，是世上最负诅咒之名的钻石。",
         "the legendary Hope Diamond, a large deep-blue gemstone resting on dark velvet under a museum spotlight"),
    75: ("库里南", "1905 年南非出土的 3106 克拉巨钻，切磨成英王权杖顶端的「非洲之星」，至今仍是世界最大宝石金刚石。",
         "the Cullinan diamond, a huge flawless colorless crystal gem glowing with cold fire"),
    80: ("光之山", "波斯语意为「光之山」，印度与英国王室辗转相夺，古训有云：「谁拥有它，便统治印度。」",
         "the Koh-i-Noor diamond, a brilliant cut colorless gem radiating rays of light"),
    85: ("摄政王", "法国王冠的 140 克拉无瑕美钻，曾镶于路易十五加冕冠，法国大革命中于橱内被窃，下落成谜。",
         "the Regent diamond, a flawless pale gem of perfect clarity on a gilded setting"),
    71: ("印度之星", "563 克拉星光蓝宝石，世界上最大的星光蓝宝石，六道星芒流转，藏于纽约自然历史博物馆。",
         "the Star of India, a huge deep-blue star sapphire with a luminous six-rayed star"),
    76: ("洛根蓝宝", "423 克拉克什米尔蓝宝石，史密森尼镇馆之宝，色泽深邃如午夜之海，重逾一般王冠主石。",
         "the Logan sapphire, a massive deep royal-blue gem of velvet depth"),
    81: ("克什米尔", "喜马拉雅绝矿所出，独有的「矢车菊蓝」如丝绒般柔和；矿脉早绝，举世珍稀，每一颗皆成绝响。",
         "a Kashmir cornflower-blue sapphire, soft velvety blue like a cornflower petal"),
    86: ("斯图亚特蓝宝", "英国王室旧藏，历经苏格兰王室流转，曾先后镶于王冠与嘉德勋章，见证帝国兴替。",
         "the Stuart sapphire, a blue gem set within an imperial crown"),
    72: ("穆索翡翠", "哥伦比亚穆索矿的「祖母绿之王」，西班牙征服者自印加帝国掠得，浓绿欲滴，价逾黄金。",
         "a Muzo Colombian emerald crystal, deep vivid green, raw and uncut"),
    77: ("穆伊斯卡", "黄金国 El Dorado 的传说：穆伊斯卡酋长身涂金粉、乘满载祖母绿的金筏行于湖上，献祭诸神。",
         "the Muisca golden raft figurine, a tiny gilded raft studded with green emeralds"),
    82: ("德文郡翡翠", "德文公爵家传的巨型哥伦比亚祖母绿，未经雕琢即见纯粹的绿，是欧洲最负盛名的祖母绿藏品。",
         "the Devonshire emerald, a large raw green emerald crystal of pure color"),
    87: ("克娄巴特拉", "埃及艳后专属西奈矿坑所出，她以翡翠镶嵌冠饰与项链，后世视翡翠为重生与春神之石。",
         "Cleopatra's emerald, a green gem in an ancient Egyptian golden setting"),
    78: ("日出红宝石", "缅甸「鸽血红」，2015 年拍出近 3000 万美元，刷新红宝石拍卖纪录，如一轮凝固的朝阳。",
         "the Sunrise Ruby, a large pigeon-blood red gem glowing like a frozen dawn"),
    83: ("卡门·露西娅", "史密森尼的 23 克拉缅甸鸽血红宝石，为纪念卡门·露西娅·巴普蒂斯塔而命名入藏。",
         "the Carmen Lucia ruby, a deep red gem set in a brilliant ring"),
    88: ("抹谷红宝", "缅甸抹谷「红宝石谷」自古产出最纯正的鸽血红，传说山谷由巨龙守护，采者必先祈福。",
         "a Mogok valley Burmese ruby, deep red like a dragon's hoard"),
    73: ("鸽血红", "顶级缅甸红宝石的专属色号，红得如鲜血欲滴、如鸽之血，象征生命、爱火与不灭的激情。",
         "a pigeon-blood Burmese ruby, intensely red as if lit from within"),
    74: ("黑奥尔洛夫", "又称「梵天之眼」的 67 克拉黑钻，传说自印度神像双眼取出，数任持有者相继自戕，邪名远播。",
         "the Black Orlov diamond, a large glossy black gem staring like an idol's eye"),
    79: ("大法国浮雕", "罗马帝国以缟玛瑙雕成的五层巨型浮雕，法国王室旧藏，是古罗马浮雕工艺的巅峰之作。",
         "the Great Cameo of France, an onyx multi-layer carved cameo with five tiers of figures"),
    84: ("图坦卡蒙之瞳", "法老图坦卡蒙黄金面具以黑曜石与石英嵌成双眼，凝视永恒三千年，被视为通往来世之窗。",
         "the obsidian eyes of Tutankhamun's golden death mask, dark glossy inlay staring eternally"),
    89: ("冥王之石", "古希腊罗马奉黑色缟玛瑙为冥王哈迪斯的护身之石，据说能镇定魂魄、辟除邪祟，随葬以护来世。",
         "a polished black onyx talisman of the underworld, dark and solemn on aged stone"),
}

STYLE = ("Oil painting, classical painterly brushstrokes, dark moody museum background with warm "
         "lantern glow, emerald-green and antique-gold accents, cinematic chiaroscuro rim lighting, "
         "the gem glowing with inner light, rich detail, no text, no watermark, no lettering, "
         "centered composition")

def build():
    out, seen = [], {}
    for c in CARDS:
        cid = c["id"]
        if cid in L3:
            name, lore, subject = L3[cid]
            img = f"card_{cid}"          # L3 每张专属
            key = img
        else:
            bonus, noun = c["bonus"], c["noun"]
            slug, scene = NOUN[noun]
            name = c["name"]
            subject = f"{GEM_ADJ[bonus]} {GEM_EN[bonus]} as the centerpiece, {scene}"
            lore = MYTH[bonus]
            img = f"card_{bonus}_{slug}"  # 同色同主题 -> 同图
            key = img
        prompt = f"{subject}. {STYLE}."
        seen[key] = seen.get(key, 0) + 1
        out.append({"id": cid, "level": c["level"], "vp": c["vp"], "name": name,
                    "bonus": c["bonus"], "noun": c.get("noun"), "lore": lore,
                    "subject": subject, "prompt": prompt, "img": img})
    return out, seen

if __name__ == "__main__":
    m, seen = build()
    json.dump(m, open(os.path.join(HERE, "card_manifest.json"), "w"), ensure_ascii=False)
    # 去重后的唯一立绘清单（生成用）
    uniq = {}
    for x in m:
        uniq.setdefault(x["img"], x)
    json.dump([{"img": k, "prompt": v["prompt"]} for k, v in uniq.items()],
              open(os.path.join(HERE, "card_art_unique.json"), "w"), ensure_ascii=False)
    # logic.js 覆盖表（name 仅 L3 生效）
    slim = {str(x["id"]): {"name": x["name"], "lore": x["lore"], "img": x["img"]} for x in m}
    json.dump(slim, open(os.path.join(HERE, "card_overrides.json"), "w"), ensure_ascii=False)
    n_l3 = sum(1 for x in m if x["id"] in L3)
    print(f"cards={len(m)} L3专属={n_l3} 唯一立绘={len(uniq)} (L1/L2共享去重省下 {50-(len(uniq)-n_l3)} 张)")
    from collections import Counter
    dup = [k for k, v in seen.items() if v > 1]
    print("共享同一立绘的主题组:", len(dup), dup[:5])
