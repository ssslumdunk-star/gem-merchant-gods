# -*- coding: utf-8 -*-
"""生成 i18n_en.js：英文翻译数据。
key 直接来自 i18n_collected.json（保证与 DOM 渲染文本精确对齐），
数据实体（神/贵族/神谕/颜色/牌名）从 logic.js 生成后并入 WORDS。
动态句（日志/提示）用正则 PATTERNS 处理。
"""
import json, re, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# ---------- 1. 读取采集结果 ----------
col = json.load(open(os.path.join(ROOT, "i18n_collected.json"), encoding="utf-8"))
blocks = col["blocks"]
attrs = col["attrs"]

# ---------- 2. 静态块翻译（zh -> en，HTML 块保留标签）----------
TR = {}
# [0] HTML
TR["卡牌左上角写着它要哪几色、各几枚。挑一张便宜的 1 级卡当目标，缺哪色就去拿哪色。第一张卡通常要攒两三回合 —— 拿完 3 颗买不起是正常的，不是你不会玩。"] = "The top-left of each card shows which colors and how many you need. Pick a cheap level-1 card as your target and grab whichever color you're short on. Your first card usually takes two or three turns — affording nothing after 3 gems is normal, not a sign you're playing badly."
TR["退还宝石：任何时候都可以用一个回合动作，把手上任意几枚筹码放回牌池 —— 退掉的宝石别人就能拿了。 凑不成牌、或桌上被拿空时，用它换色、也给全桌解套。"] = "Return Gems: at any time, spend one turn action to put any number of your tokens back into the pool — the gems you return are fair game for others. Use it to swap colors when you can't complete a card, or to untangle a starved board."
TR["颜色够了就点这张卡买下。买卡消耗你手上的宝石，但该色永久 +1 折扣，以后买卡每张再减 1。折扣 永远属于你、不消耗 —— 这是全场最重要的资产。"] = "When you have the colors, tap the card to buy it. Buying spends your gems but grants a permanent +1 discount in that color, cutting the cost of every future card by 1. The discount is yours forever and never spent — it is the single most important asset in the game."
TR["神技：① 若你的永久色达到某贵族需求，可偷取其他角色持有的该贵族；② 可压住桌上一位贵族：得 1 黄金，且他人直到你下回合结束前不能接待它。"] = "<b>Power:</b> ① If your permanent colors meet a noble's need, you may steal that noble from another player; ② you may pin a noble on the table: gain 1 gold, and no one else may receive it until the end of your next turn."
TR["狄俄尼索斯：不能压牌；你的回合结束时，若你的宝石数是全场最少（并列不算，须严格最少），可从桌上再免费取一枚。"] = "<b>Dionysus:</b> Cannot reserve; at the end of your turn, if your gem count is the lowest at the table (no ties — strictly lowest), you may take one more gem from the table for free."
TR["赫尔墨斯：永久色达到某贵族需求即可偷取他人持有的该贵族；另可压住桌上一位贵族——得 1 黄金，且他人直到你下回合结束前不能接待它。"] = "<b>Hermes:</b> Once your permanent colors meet a noble's need you may steal that noble from another player; you may also pin a noble on the table — gain 1 gold, and no one else may receive it until the end of your next turn."
TR["贵族要的是永久折扣（你买过几张该色卡），不是手上的宝石。回合结束自动结算，够了就 +4 声望，不占你的回合。声望到线即触发终局。"] = "Nobles want your permanent discounts (cards you've bought in that color), not the gems in your hand. They are settled automatically at end of turn; once met you gain +4 prestige and it costs no turn of your own. Reaching the target triggers the endgame."
TR["每回合从「拿宝石 / 预留 / 买卡」三选一。拿宝石就是点下方宝石：选满 3 枚不同色，或某色桌上 ≥4 枚时取同色 2 枚。"] = "Each turn, choose one of: Take Gems / Reserve / Buy. To take gems, tap the gems below: pick 3 of different colors, or 2 of the same color when a color has ≥4 on the table."
TR["今后买任何卡，该色费用 -1（可叠加至 0）。例：已有 2 翡翠折扣，买「需 4 翡翠」的卡实际只付 2 翡翠。"] = "From now on, every card costs 1 less in that color (stackable down to 0). Example: with 2 emerald discounts, a card needing 4 emeralds actually costs only 2."
TR["神技：不能压牌；你的回合结束时，若你的宝石数是全场最少（并列不算，须严格最少），可从桌上再免费取一枚。"] = "<b>Power:</b> Cannot reserve; at the end of your turn, if your gem count is the lowest at the table (no ties — strictly lowest), you may take one more gem from the table for free."
TR["神技：其他角色接待贵族前须经你同意；你拒绝则其本回合不能接待，且你获得 1 声望（拒绝不再弃宝石）。"] = "<b>Power:</b> Other players must get your approval before receiving a noble; if you decline, they cannot receive one this turn, and you gain 1 prestige (declining no longer costs a gem)."
TR["赫拉：他人接待贵族须经你同意；拒绝时你只弃一枚普通宝石（不必弃黄金），无宝石则不能拒绝。"] = "<b>Hera:</b> Others must get your approval to receive a noble; when you decline you only discard one ordinary gem (gold exempt), and without a gem you cannot decline."
TR["目标声望默认 15（大厅可选 12 / 15 / 18 / 20，分别对应快局到长局）。"] = "Target prestige defaults to 15 (lobby options 12 / 15 / 18 / 20, from quick games to long ones)."
TR["神技：不能压牌；限三次，买牌时指定一张明牌，本回合视作拥有其宝石奖励（对贵族无效）。"] = "<b>Power:</b> Cannot reserve; three times per game, when buying you may name a face-up card whose gem bonus counts as yours this turn (does not help with nobles)."
TR["神技：不能购买 1 级牌；购买 2、3 级牌可少付一枚（每 5 回合限一次）。"] = "<b>Power:</b> Cannot buy level-1 cards; when buying a level 2 or 3 card you may pay one less gem (once every 5 turns)."
TR["· 永久折扣（购卡后获得）：买下的每张卡送你该色 +1 折扣，永久属于你、不消耗。"] = "· Permanent Discount (gained by buying): each card you buy grants +1 discount in its color, yours forever and never spent."
TR["筹码持有上限 10 枚。满了就不能再拿（拿了也会被强制退回，等于白走一回合）。"] = "Token limit is 10. Once full you cannot take more (if you do, they're forcibly returned, wasting your turn)."
TR["· 手中宝石筹码（下方一排）：拿取获得，买卡时消耗掉还回牌池，是一次性的。"] = "· Hand Tokens (the row below): gained by taking gems, spent when you buy and returned to the pool — they are single-use."
TR["可选 1v1（纯二人）或 2 人 + 1 AI（加一位神祇 AI 搅局）。"] = "Choose 1v1 (pure two-player) or 2 players + 1 AI (a god AI joins to stir things up)."
TR["神技：拿宝石或压牌后，可免费指定一色：直至你下回合，其他角色不能拿该色。"] = "<b>Power:</b> After taking gems or reserving, you may lock one color for free: until your next turn, no other player may take that color."
TR["① 拿取宝石 —— 3 枚不同色；或场上某色 ≥4 枚时取同色 2 枚。"] = "① Take Gems — 3 different colors; or 2 of the same color when a color has ≥4 on the board."
TR["③ 购买市场或已预留的卡牌 —— 支付手中宝石筹码，获得声望与永久折扣。"] = "③ Buy a card from the market or your reserve — pay with hand tokens, gain prestige and a permanent discount."
TR["神技：斗富：连续 2 回合保持全场宝石最多（含并列），买牌可少付一枚。"] = "<b>Power:</b> Flaunt Wealth: if you hold the most gems at the table (ties allowed) for 2 turns running, you may pay one less gem when buying."
TR["神技：不能拿两枚同色；每回合一次，若某色桌上仅剩一枚，你可免费拿走。"] = "<b>Power:</b> Cannot take two of the same color; once per turn, if only one of a color remains on the table, you may take it for free."
TR["② 预留卡牌（市场或牌堆顶）—— 顺带得 1 黄金，手留 ≤3 张。"] = "② Reserve a card (from the market or the top of a deck) — also gain 1 gold, up to 3 reserved."
TR["每回合结束自动结算，不占用回合，+4 声望；同时满足多位时自选一位。"] = "Settled automatically at end of every turn, costs no turn of your own, +4 prestige; if you qualify for several at once, choose one."
TR["神技：点金：拿取 2 枚同色宝石时，50% 概率其中一枚化作黄金。"] = "<b>Power:</b> The Golden Touch: when you take 2 gems of the same color, there is a 50% chance one of them turns to gold."
TR["达到线者触发终局，本轮走完后声望最高者胜；同分比卡牌数少者胜。"] = "Reaching the target triggers the endgame; after the round ends, highest prestige wins; on a tie, the player with fewer cards wins."
TR["神技：不能接待贵族；其他角色接待贵族时，你获得 2 声望。"] = "<b>Power:</b> Cannot receive nobles; when another player receives a noble, you gain 2 prestige."
TR["神技：不能压牌；若全部其他角色都有压牌，你买牌可少付一枚。"] = "<b>Power:</b> Cannot reserve; if every other player has a reserve, you may pay one less gem when buying."
TR["神技：不能压牌；每当你买牌，可将一张同级明牌埋底并补新。"] = "<b>Power:</b> Cannot reserve; whenever you buy, you may bury a face-up card of the same level and draw a new one."
TR["美杜莎：拿宝石或压牌后可免费封一色（不再需要弃宝石），他人直到你下回合前不能拿该色。"] = "<b>Medusa:</b> After taking gems or reserving, you may lock one color for free (no longer need to discard a gem); others cannot take that color until the start of your next turn."
TR["狄俄尼索斯：不能压牌；你的回合结束时，若你的宝石数是全场最少（并列不算，须严格最少），可从桌上再免费取一枚。买了牌、筹码见底时正好触发。"] = "<b>Dionysus:</b> Cannot reserve; at the end of your turn, if your gem count is the lowest at the table (no ties — strictly lowest), you may take one more gem from the table for free. This triggers right when you've bought a card and run low on tokens."
TR["奥林匹斯山主神，执雷霆权杖，裁决人间善恶、主持神圣盟约，亦以多情著称。"] = "Lord of Mount Olympus, wielding the thunderbolt, judging good and evil among men and presiding over sacred oaths — and famed for his many loves."
TR["点宝石可选中，选满再点「拿取」确认；也可直接点卡牌购买。"] = "Tap gems to select them, then tap 'Take' to confirm; you can also buy a card directly."
TR["神技：拿宝石必须拿满三种不同色；拿满后可弃一枚换一金。"] = "<b>Power:</b> You must take a full set of three different colors; after doing so you may discard one to gain a gold."
TR["2 人局按官方规则：每色宝石 4 枚、贵族上桌 3 张。"] = "2-player games follow official rules: 4 gems per color, 3 nobles on the table."
TR["普罗米修斯盗火者 · 均衡 · AI 模拟胜率 37.3%"] = "Prometheus<em>The Fire-Stealer · Balanced · AI sim winrate 37.3%</em>"
TR["美杜莎蛇发女妖 · 冷门 · AI 模拟胜率 18.7%"] = "Medusa<em>The Gorgon · Underdog · AI sim winrate 18.7%</em>"
TR["赫尔墨斯信使与窃贼 · 冷门 · AI 模拟胜率 14%"] = "Hermes<em>The Messenger & Thief · Underdog · AI sim winrate 14%</em>"
TR["贵族要的是永久折扣（买过几张该色卡），不是手中宝石筹码。"] = "Nobles want your permanent discount (cards bought in that color), not the tokens in your hand."
TR["普路托斯财富之神 · 强势 · AI 模拟胜率 56%"] = "Plutus<em>God of Wealth · Dominant · AI sim winrate 56%</em>"
TR["堤丰巨兽之父 · 均衡 · AI 模拟胜率 24.7%"] = "Typhon<em>Father of Monsters · Balanced · AI sim winrate 24.7%</em>"
TR["宙斯众神之王 · 强势 · AI 模拟胜率 63.3%"] = "Zeus<em>King of the Gods · Dominant · AI sim winrate 63.3%</em>"
TR["米达斯点金之手 · 冷门 · AI 模拟胜率 14%"] = "Midas<em>The Golden Touch · Underdog · AI sim winrate 14%</em>"
TR["法厄同太阳战车 · 均衡 · AI 模拟胜率 30%"] = "Phaethon<em>The Sun-Chariot · Balanced · AI sim winrate 30%</em>"
TR["波塞冬海神 · 均衡 · AI 模拟胜率 21.3%"] = "Poseidon<em>God of the Sea · Balanced · AI sim winrate 21.3%</em>"
TR["哈迪斯冥王 · 强势 · AI 模拟胜率 68.7%"] = "Hades<em>God of the Underworld · Dominant · AI sim winrate 68.7%</em>"
TR["狄俄尼索斯酒神 · 强势 · AI 模拟胜率 48%"] = "Dionysus<em>God of Wine · Dominant · AI sim winrate 48%</em>"
TR["赫拉天后 · 冷门 · AI 模拟胜率 17.3%"] = "Hera<em>Queen of the Gods · Underdog · AI sim winrate 17.3%</em>"
TR["丘比特爱神 · 均衡 · AI 模拟胜率 24%"] = "Cupid<em>God of Love · Balanced · AI sim winrate 24%</em>"
TR["桌上宝石点它拿取 · 每回合只能做一个动作"] = "Table gems: tap to take · only one action per turn"
TR["市场里的卡左上角是它要的颜色，右上角是声望"] = "Market cards: top-left shows the colors it needs, top-right shows prestige"
TR["我的资产手上的宝石是一次性的，折扣是永久的"] = "My Assets: hand gems are single-use, discounts are permanent"
TR["贵族来访要的是永久折扣，不是手上的宝石"] = "Visiting nobles want your permanent discount, not the gems in your hand"
TR["还没有战绩。打完一局再回来看看。"] = "No records yet. Come back after you finish a game."
TR["永久折扣：还没有"] = "Permanent discount: none yet"
TR["AI 胜率18.7%"] = "<span>AI sim winrate</span><b>18.7%</b>"
TR["AI 胜率37.3%"] = "<span>AI sim winrate</span><b>37.3%</b>"
TR["AI 胜率24.7%"] = "<span>AI sim winrate</span><b>24.7%</b>"
TR["AI 胜率63.3%"] = "<span>AI sim winrate</span><b>63.3%</b>"
TR["AI 胜率17.3%"] = "<span>AI sim winrate</span><b>17.3%</b>"
TR["AI 胜率21.3%"] = "<span>AI sim winrate</span><b>21.3%</b>"
TR["AI 胜率68.7%"] = "<span>AI sim winrate</span><b>68.7%</b>"
TR["AI 胜率14%"] = "<span>AI sim winrate</span><b>14%</b>"
TR["AI 胜率56%"] = "<span>AI sim winrate</span><b>56%</b>"
TR["AI 胜率30%"] = "<span>AI sim winrate</span><b>30%</b>"
TR["AI 胜率24%"] = "<span>AI sim winrate</span><b>24%</b>"
TR["AI 胜率48%"] = "<span>AI sim winrate</span><b>48%</b>"
TR["12快局"] = "<b>12</b><em>Quick</em>"
TR["15标准"] = "<b>15</b><em>Standard</em>"
TR["18中局"] = "<b>18</b><em>Mid</em>"
TR["20长局"] = "<b>20</b><em>Long</em>"
TR["声望 0"] = "Prestige 0"

# [TEXT]
TR["特殊时刻会出现选项：赫拉否决、酒神赐福、美杜莎诅咒、盗火选源、堤丰埋底、点石成金、赫尔墨斯窃取/压住贵族等，按提示操作即可。"] = "Special moments trigger options: Hera's Veto, Dionysus's Blessing, Medusa's Curse, Prometheus's Source, Typhon's Burial, Midas's Touch, Hermes's Steal / Pin a Noble, etc. Just follow the on-screen prompts."
TR["大厅「创建房间」→ 把邀请链接或 6 位房间码发给好友 → 好友点链接或输码加入，人齐并各自选神后自动开局。"] = "Lobby 'Create Room' → send the invite link or 6-character room code to a friend → they click the link or enter the code to join; once everyone is in and has picked a god, the game starts automatically."
TR["例：「雅典娜」需 钻石折扣×3 + 蓝宝石折扣×3 —— 你买过 3 张钻石卡和 3 张蓝宝石卡即满足。"] = "Example: 'Athena' needs 3× diamond discount + 3× sapphire discount — you satisfy it by having bought 3 diamond cards and 3 sapphire cards."
TR["弗里吉亚国王，因款待酒神获点金术——凡触手之物皆成黄金，连女儿与食物也未能幸免，最终在溪边祈求而解。"] = "King of Phrygia, granted the golden touch for his hospitality to Dionysus — everything he touched turned to gold, even his daughter and his food, until he prayed by a stream and was released."
TR["原为雅典娜神殿女祭司，因被波塞冬玷污于神殿、又遭雅典娜嫉恨，一头秀发被化为毒蛇，凡见其面者尽成石像。"] = "Once a priestess of Athena's temple, polluted by Poseidon within the shrine and then cursed by Athena's jealousy — her hair was turned to serpents, and all who beheld her face became stone."
TR["手持筹码满 10 枚后，动作栏会出现「♻️ 退还宝石」——点它，再点下方宝石选择要退回池子的数量。"] = "Once you hold 10 tokens, a '♻️ Return Gems' action appears in the action bar — tap it, then tap the gems below to choose how many to put back into the pool."
TR["维纳斯之子，执金箭令人心生爱慕、执铅箭令人生厌。曾误中河神女儿俄耳甫斯之妻，酿成冥府寻妻的悲剧。"] = "Son of Venus, wielding golden arrows that kindle love and leaden ones that breed contempt. Once he struck the river-god's daughter, Orpheus's wife, sparking the tragedy of the descent to the Underworld."
TR["提坦神族，盗天火予人间，又以脂膏裹枯木愚弄宙斯。被缚高加索山崖，日日遭神鹰啄食肝脏，夜复重生。"] = "A Titan who stole fire for mankind and mocked Zeus with fat-wrapped kindling. Bound to the Caucasus cliffs, his liver was torn by an eagle by day and renewed each night."
TR["盖亚与塔尔塔罗斯之子，百首巨蟒，曾掰下奥林匹斯山掷向诸神。败于宙斯雷火，被压于埃特纳火山之下。"] = "Son of Gaia and Tartarus, a hundred-headed serpent who once hurled Mount Olympus at the gods. Felled by Zeus's thunder and pinned beneath Mount Etna."
TR["宙斯长兄，掌管冥府与地下宝藏，三兄弟抽签各得天地冥。其妻珀耳塞福奈为谷物女神之女，被掳入冥府。"] = "Elder brother of Zeus, ruler of the Underworld and its buried treasures; the three brothers drew lots for sky, sea and underworld. His wife Persephone, daughter of the grain goddess, was carried off to the realm below."
TR["宙斯信使，穿飞鞋往来神人两界，亦是商旅、小偷与辩术的守护神。出生当日即盗走阿波罗的牛群。"] = "Zeus's messenger, wearing winged sandals between gods and men, and patron of travelers, thieves and eloquence. On the day he was born he stole Apollo's cattle."
TR["太阳神赫利俄斯之子，为证身世强驾父亲的日车，因控不住天马而焚焦大地，终被宙斯雷电击落。"] = "Son of Helios the sun-god, who to prove his birth drove his father's sun-chariot, scorched the earth when he could not control the horses, and was struck down by Zeus's thunderbolt."
TR["葡萄酒与狂欢之神，两次诞生：先为宙斯凡人妻子塞墨勒所生，后由宙斯缝入大腿孕育至成熟。"] = "God of wine and revelry, born twice: first of Semele, a mortal wife of Zeus, then sewn into Zeus's thigh until full term."
TR["宙斯之妻与姐姐，婚姻与生育守护神。因宙斯风流而嫉恨百出，特洛伊之战即由她一手掀起。"] = "Wife and sister of Zeus, guardian of marriage and childbirth. Provoked by his affairs into endless jealousy, she herself ignited the Trojan War."
TR["执三叉戟，跺脚成海啸、挥戟裂大地。与雅典娜争当雅典守护神，以海中首驹为礼而胜。"] = "Wielding a trident, his stamp brings tsunamis and his spear splits the earth. He vied with Athena to be patron of Athens and lost, gifting the first horse from the sea."
TR["希腊财神，本为农业丰饶之神；神话中他双目失明，故财富分配全凭命运，而非公允。"] = "Greek god of wealth, originally a god of agricultural abundance; in myth he is blind, so riches are dealt by chance rather than fairness."
TR["开局降下神谕碑，回合结束满足即直接获胜（与神战/经典互不冲突）"] = "At the start an Oracle stele descends; satisfy it by end of turn to win outright (does not conflict with God War / Classic)."
TR["点选一位神祇，查看典故与神技。共 13 位神祇，分 3 页。"] = "Tap a god to see its lore and power. 13 gods in total, across 3 pages."
TR["蛇发女妖 · 冷门 · AI 模拟胜率 18.7%"] = "The Gorgon · Underdog · AI sim winrate 18.7%"
TR["巨兽之父 · 均衡 · AI 模拟胜率 24.7%"] = "Father of Monsters · Balanced · AI sim winrate 24.7%"
TR["众神之王 · 强势 · AI 模拟胜率 63.3%"] = "King of the Gods · Dominant · AI sim winrate 63.3%"
TR["盗火者 · 均衡 · AI 模拟胜率 37.3%"] = "The Fire-Stealer · Balanced · AI sim winrate 37.3%"
TR["信使与窃贼 · 冷门 · AI 模拟胜率 14%"] = "The Messenger & Thief · Underdog · AI sim winrate 14%"
TR["点金之手 · 冷门 · AI 模拟胜率 14%"] = "The Golden Touch · Underdog · AI sim winrate 14%"
TR["财富之神 · 强势 · AI 模拟胜率 56%"] = "God of Wealth · Dominant · AI sim winrate 56%"
TR["太阳战车 · 均衡 · AI 模拟胜率 30%"] = "The Sun-Chariot · Balanced · AI sim winrate 30%"
TR["天后 · 冷门 · AI 模拟胜率 17.3%"] = "Queen of the Gods · Underdog · AI sim winrate 17.3%"
TR["海神 · 均衡 · AI 模拟胜率 21.3%"] = "God of the Sea · Balanced · AI sim winrate 21.3%"
TR["冥王 · 强势 · AI 模拟胜率 68.7%"] = "God of the Underworld · Dominant · AI sim winrate 68.7%"
TR["鼠标悬停任意卡牌 → 看折后费用与还缺哪几枚。"] = "Hover any card → see discounted cost and which gems you still lack."
TR["刷新页面可断线重连；退出房间点顶部「离开」。"] = "Refresh the page to reconnect after a drop; to leave the room tap 'Leave' at the top."
TR["悬停贵族卡 → 看你每色已有几折、还差几折。"] = "Hover a noble → see how many discounts you already have per color and how many you still need."
TR["爱神 · 均衡 · AI 模拟胜率 24%"] = "God of Love · Balanced · AI sim winrate 24%"
TR["酒神 · 强势 · AI 模拟胜率 48%"] = "God of Wine · Dominant · AI sim winrate 48%"
TR["开局所选神祇各带独门特技（悬停神名可查）。"] = "The god you pick at the start brings its own unique power (hover the god's name to check)."
TR["HOW TO PLAY · 可以直接点着玩"] = "HOW TO PLAY · you can just click and play"
TR["触屏设备点击卡牌即可查看详情（无悬停）。"] = "On touch devices, tap a card to see details (no hover)."
TR["你和朋友，再加一位神祇 AI 同席搅局"] = "You and a friend, plus a god AI at the table to stir things up"
TR["额外胜利路径（可选 · 独立开关）"] = "Extra victory path (optional · separate toggle)"
TR["点它拿取 · 每回合只能做一个动作"] = "Tap to take · only one action per turn"
TR["手上的宝石是一次性的，折扣是永久的"] = "Hand gems are single-use, discounts are permanent"
TR["回到纯粹的宝石与声望，无任何神技"] = "Back to pure gems and prestige, with no god powers"
TR["左上角是它要的颜色，右上角是声望"] = "Top-left shows the colors it needs, top-right shows prestige"
TR["要的是永久折扣，不是手上的宝石"] = "What they want is your permanent discount, not the gems in your hand"
TR["目标声望与规则模式由房主设定"] = "Target prestige and rule mode are set by the host"
TR["↓ 上下滚动查看全部章节 ↓"] = "↓ Scroll up and down to view all sections ↓"
TR["开局各带一位神祇与独门神技"] = "Each side starts with one god and its unique power"
TR["目标声望（达到即触发终局）"] = "Target prestige (reaching it triggers the endgame)"
TR["纯二人对决，无 AI 介入"] = "Pure two-player duel, no AI involved"
TR["二 · 两种「宝石」别搞混"] = "Two · don't mix up the two kinds of 'gems'"
TR["三 · 神祇（贵族）来访"] = "Three · gods (nobles) pay a visit"
TR["第一张卡通常要攒两三回合"] = "Your first card usually takes two or three turns"
TR["房间码是 6 位字母数字"] = "The room code is 6 letters and digits"
TR["挑一张便宜的 1 级卡"] = "Pick a cheap level-1 card"
TR["经典模式 · 禁用神"] = "Classic mode · gods disabled"
TR["2 人 + 1 AI"] = "2 players + 1 AI"
TR["输入好友发来的房间码"] = "Enter the room code your friend sent"
TR["一 · 一回合一动作"] = "One · one action per turn"
TR["每回合从下列三选一："] = "Each turn choose one of the following:"
TR["该色永久 +1 折扣"] = "permanent +1 discount in that color"
TR["以 此 神 入 局"] = "Enter with this god"
TR["永远属于你、不消耗"] = "yours forever and never spent"
TR["四 · 神祇特技"] = "Four · god powers"
TR["五 · 胜利条件"] = "Five · victory conditions"
TR["六 · 联机对战"] = "Six · online battle"
TR["七 · 操作提示"] = "Seven · play tips"
TR["贵 族 来 访"] = "NOBLES VISIT"
TR["📡 上报诊断"] = "📡 Send diagnostics"
TR["宝 石 商 人"] = "GEM MERCHANT"
TR["玩 法 演 示"] = "HOW TO PLAY"
TR["商 道 规 矩"] = "THE RULES"
TR["创 建 房 间"] = "CREATE ROOM"
TR["加 入 房 间"] = "JOIN ROOM"
TR["回 到 商 行"] = "BACK TO SHOP"
TR["取同色 2 枚"] = "take 2 of one color"
TR["重 新 开 始"] = "RESTART"
TR["我 的 商 道"] = "MY LEDGER"
TR["⚜ 神谕模式"] = "⚜ Oracle Mode"
TR["选择对局模式"] = "Choose game mode"
TR["手中宝石筹码"] = "hand tokens"
TR["一枚普通宝石"] = "one ordinary gem"
TR["还缺 4 枚"] = "4 more to go"
TR["3 枚不同色"] = "3 different colors"
TR["不占你的回合"] = "costs no turn of your own"
TR["AI 胜率"] = "AI sim winrate"
TR["普罗米修斯"] = "Prometheus"
TR["信使与窃贼"] = "The Messenger & Thief"
TR["狄俄尼索斯"] = "Dionysus"
TR["永久属于你"] = "yours forever"
TR["不占用回合"] = "costs no turn"
TR["折扣 ×1"] = "discount ×1"
TR["+4 声望"] = "+4 prestige"
TR["折扣还不够"] = "discount still short"
TR["上 一 步"] = "PREV"
TR["下 一 步"] = "NEXT"
TR["总 场 次"] = "TOTAL GAMES"
TR["复制邀请"] = "Copy Invite"
TR["单人闯荡"] = "Solo Play"
TR["创建房间"] = "Create Room"
TR["加入房间"] = "Join Room"
TR["规则模式"] = "Rule Mode"
TR["神战模式"] = "God War Mode"
TR["点金之手"] = "The Golden Touch"
TR["普路托斯"] = "Plutus"
TR["财富之神"] = "God of Wealth"
TR["蛇发女妖"] = "The Gorgon"
TR["巨兽之父"] = "Father of Monsters"
TR["你的名号"] = "Your Name"
TR["太阳战车"] = "The Sun-Chariot"
TR["众神之王"] = "King of the Gods"
TR["赫尔墨斯"] = "Hermes"
TR["拿取宝石"] = "Take Gems"
TR["永久折扣"] = "permanent discount"
TR["10 枚"] = "10 tokens"
TR["不能再拿"] = "cannot take more"
TR["退还宝石"] = "Return Gems"
TR["自选一位"] = "choose one"
TR["并列不算"] = "no ties"
TR["翡翠矿脉"] = "Emerald Vein"
TR["自动结算"] = "auto-settle"
TR["场均回合"] = "avg turns"
TR["米达斯"] = "Midas"
TR["美杜莎"] = "Medusa"
TR["盗火者"] = "The Fire-Stealer"
TR["神技："] = "Power:"
TR["法厄同"] = "Phaethon"
TR["丘比特"] = "Cupid"
TR["波塞冬"] = "Poseidon"
TR["哈迪斯"] = "Hades"
TR["消耗掉"] = "spent"
TR["结束时"] = "at end"
TR["4 枚"] = "4 gems"
TR["3 张"] = "3 cards"
TR["折扣卡"] = "discount card"
TR["密涅瓦"] = "Minerva"
TR["还没有"] = "none yet"
TR["关 闭"] = "CLOSE"
TR["胜 率"] = "WIN RATE"
TR["胜 场"] = "WINS"
TR["离开"] = "Leave"
TR["规则"] = "Rules"
TR["战绩"] = "Records"
TR["快局"] = "Quick"
TR["标准"] = "Standard"
TR["中局"] = "Mid"
TR["长局"] = "Long"
TR["冷门"] = "Underdog"
TR["强势"] = "Dominant"
TR["均衡"] = "Balanced"
TR["堤丰"] = "Typhon"
TR["爱神"] = "God of Love"
TR["宙斯"] = "Zeus"
TR["赫拉"] = "Hera"
TR["天后"] = "Queen of the Gods"
TR["海神"] = "God of the Sea"
TR["冥王"] = "God of the Underworld"
TR["酒神"] = "God of Wine"
TR["预留"] = "Reserve"
TR["购买"] = "Buy"
TR["不是"] = "not"
TR["免费"] = "free"
TR["达到"] = "reach"
TR["压住"] = "pin"
TR["少"] = "fewer"

# ---------- 3. 属性翻译 ----------
ATTR = {a: a for a in attrs}  # 先占位，下面覆盖已知
ATTR["① 若你的永久色达到某贵族需求，可偷取其他角色持有的该贵族；② 可压住桌上一位贵族：得 1 黄金，且他人直到你下回合结束前不能接待它。"] = "① If your permanent colors meet a noble's need, steal it from another player; ② pin a noble on the table: gain 1 gold, others can't receive it until your next turn."
ATTR["不能压牌；你的回合结束时，若你的宝石数是全场最少（并列不算，须严格最少），可从桌上再免费取一枚。"] = "Cannot reserve; at end of your turn, if your gem count is strictly the lowest, take one more from the table."
ATTR["其他角色接待贵族前须经你同意；你拒绝则其本回合不能接待，且你获得 1 声望（拒绝不再弃宝石）。"] = "Others need your approval to receive a noble; if you decline they can't this turn and you gain 1 prestige."
ATTR["不能压牌；限三次，买牌时指定一张明牌，本回合视作拥有其宝石奖励（对贵族无效）。"] = "Cannot reserve; 3× per game, name a face-up card whose gem bonus counts as yours this turn (not for nobles)."
ATTR["不能购买 1 级牌；购买 2、3 级牌可少付一枚（每 5 回合限一次）。"] = "Cannot buy level-1; buying level 2/3 costs one less gem (once per 5 turns)."
ATTR["拿宝石或压牌后，可免费指定一色：直至你下回合，其他角色不能拿该色。"] = "After taking gems or reserving, lock one color: others can't take it until your next turn."
ATTR["斗富：连续 2 回合保持全场宝石最多（含并列），买牌可少付一枚。"] = "Flaunt Wealth: most gems for 2 turns running → pay one less when buying."
ATTR["不能拿两枚同色；每回合一次，若某色桌上仅剩一枚，你可免费拿走。"] = "Cannot take two of one color; once per turn, if only 1 of a color remains, take it free."
ATTR["点金：拿取 2 枚同色宝石时，50% 概率其中一枚化作黄金。"] = "The Golden Touch: when taking 2 of one color, 50% chance one turns to gold."
ATTR["不能接待贵族；其他角色接待贵族时，你获得 2 声望。"] = "Cannot receive nobles; when another player receives one, you gain 2 prestige."
ATTR["不能压牌；若全部其他角色都有压牌，你买牌可少付一枚。"] = "Cannot reserve; if all others have a reserve, pay one less when buying."
ATTR["不能压牌；每当你买牌，可将一张同级明牌埋底并补新。"] = "Cannot reserve; on each buy you may bury a same-level face-up card and draw a new one."
ATTR["拿宝石必须拿满三种不同色；拿满后可弃一枚换一金。"] = "Must take a full set of three colors; then may discard one for 1 gold."
ATTR["构建版本：报问题时请附上这串"] = "Build version: please include this string when reporting issues"
ATTR["普罗米修斯"] = "Prometheus"
ATTR["狄俄尼索斯"] = "Dionysus"
ATTR["我的战绩"] = "My Records"
ATTR["普路托斯"] = "Plutus"
ATTR["赫尔墨斯"] = "Hermes"
ATTR["音乐开"] = "Sound on"
ATTR["米达斯"] = "Midas"
ATTR["美杜莎"] = "Medusa"
ATTR["挑战者"] = "Challenger"
ATTR["法厄同"] = "Phaethon"
ATTR["丘比特"] = "Cupid"
ATTR["波塞冬"] = "Poseidon"
ATTR["哈迪斯"] = "Hades"
ATTR["堤丰"] = "Typhon"
ATTR["房主"] = "Host"
ATTR["宙斯"] = "Zeus"
ATTR["赫拉"] = "Hera"

# ---------- 4. 数据实体 WORDS（神/贵族/神谕/颜色/卡名）----------
data = json.load(open(os.path.join(ROOT, "i18n_data.json"), encoding="utf-8"))
WORDS = {}
# colors
WORDS.update({
    "钻石": "Diamond", "蓝宝石": "Sapphire", "翡翠": "Emerald",
    "红宝石": "Ruby", "玛瑙": "Onyx", "黄金": "Gold",
})
# tiers / 难度
WORDS.update({"强势": "Dominant", "均衡": "Balanced", "冷门": "Underdog",
              "高": "Hard", "中": "Medium", "低": "Easy"})
# gods
GOD_EN = {
    "midas": ("Midas", "The Golden Touch"),
    "plutus": ("Plutus", "God of Wealth"),
    "medusa": ("Medusa", "The Gorgon"),
    "prometheus": ("Prometheus", "The Fire-Stealer"),
    "typhon": ("Typhon", "Father of Monsters"),
    "phaethon": ("Phaethon", "The Sun-Chariot"),
    "cupid": ("Cupid", "God of Love"),
    "zeus": ("Zeus", "King of the Gods"),
    "hera": ("Hera", "Queen of the Gods"),
    "poseidon": ("Poseidon", "God of the Sea"),
    "hades": ("Hades", "God of the Underworld"),
    "hermes": ("Hermes", "The Messenger & Thief"),
    "dionysus": ("Dionysus", "God of Wine"),
}
for g in data["gods"]:
    WORDS[g["name"]] = GOD_EN[g["id"]][0]
    WORDS[g["title"]] = GOD_EN[g["id"]][1]
# nobles
NOBLE_EN = {}
for n in data["nobles"]:
    WORDS[n["name"]] = n["name"]  # placeholder, set proper below
NOBLE_MAP = {
    "盖亚": "Gaia", "雅典娜": "Athena", "阿波罗": "Apollo", "赫菲斯托斯": "Hephaestus",
    "赫尔墨斯": "Hermes", "阿尔忒弥斯": "Artemis", "德墨忒尔": "Demeter", "赫拉": "Hera",
    "阿瑞斯": "Ares", "狄俄涅": "Dione", "赫卡忒": "Hecate",
}
NOBLE_TITLE = {
    "盖亚": "Mother Earth", "雅典娜": "Goddess of Wisdom", "阿波罗": "God of the Sun",
    "赫菲斯托斯": "God of the Forge", "赫尔墨斯": "God of Commerce",
    "阿尔忒弥斯": "Goddess of the Hunt", "德墨忒尔": "Goddess of Grain",
    "赫拉": "Queen of the Gods", "阿瑞斯": "God of War", "狄俄涅": "Goddess of the Sea",
    "赫卡忒": "Goddess of Crossroads",
}
for n in data["nobles"]:
    WORDS[n["name"]] = NOBLE_MAP.get(n["name"], n["name"])
    WORDS[n["title"]] = NOBLE_TITLE.get(n["title"], n["title"])
# oracles
ORACLE_EN = {
    "color": ("Color Collection", "Any 2 colors, ≥4 cards each", "Hard"),
    "high": ("High Mastery", "Hold ≥4 level-3 cards", "Hard"),
    "nobles": ("Noble Favor", "Host ≥2 nobles", "Medium"),
    "rainbow": ("Rainbow Collection", "All 5 colors, ≥2 cards each", "Hard"),
    "goldnob": ("Divine Goldmine", "Hold ≥3 gold AND host ≥1 noble", "Medium"),
}
for o in data["oracles"]:
    WORDS[o["name"]] = ORACLE_EN[o["key"]][0]
    WORDS[o["desc"]] = ORACLE_EN[o["key"]][1]
    WORDS[o["difficulty"]] = ORACLE_EN[o["key"]][2]
# phrases
WORDS["AI 模拟胜率"] = "AI sim winrate"
WORDS["声望"] = "prestige"
WORDS["贵族"] = "noble"
WORDS["神谕"] = "Oracle"

# 动态句片段（对局内由颜色名/数字拼出，无法逐条列举，用子串兜底）
WORDS["折扣"] = "discount"
WORDS["该色"] = "this color"
WORDS["费用"] = "cost"
WORDS["无声望"] = "no prestige"
WORDS["需要"] = "requires"
WORDS["需 "] = "need "            # 与"需要"区分：带尾随空格，只命中"需 3 折扣"这类
WORDS["已有 "] = "have "
WORDS["级"] = " tier"
WORDS["买后永久 +1"] = "after buying: permanent +1"
WORDS["购买后 +1"] = "after buying: +1"
WORDS["永久 +1"] = "permanent +1"
WORDS["购卡时该色费用"] = "this color's cost when buying"

# 卡名：颜色+类型（L1/L2）/ 专有宝石名（L3）
L1 = {"坑道": "Pit", "探方": "Excavation", "晶洞": "Geode", "矿脉": "Vein",
      "竖井": "Shaft", "采石场": "Quarry", "矿坑": "Mine", "砂矿": "Placer"}
L2 = {"商会": "Guild", "商队": "Caravan", "银号": "Bank", "铺面": "Shop",
      "雕琢室": "Lapidary", "工坊": "Workshop", "拍卖行": "Auction", "货栈": "Warehouse"}
L3 = {"光之山": "Koh-i-Noor", "克什米尔": "Kashmir", "克娄巴特拉": "Cleopatra",
      "冥王之石": "Stone of Hades", "卡门·露西娅": "Carmen Lúcia", "印度之星": "Star of India",
      "图坦卡蒙之瞳": "Eye of Tutankhamun", "大法国浮雕": "Grand French Cameo",
      "希望钻石": "Hope Diamond", "库里南": "Cullinan", "德文郡翡翠": "Devonshire Emerald",
      "抹谷红宝": "Mogok Ruby", "摄政王": "Regent", "斯图亚特蓝宝": "Stuart Sapphire",
      "日出红宝石": "Sunrise Ruby", "洛根蓝宝": "Logan Sapphire", "穆伊斯卡": "Muisca",
      "穆索翡翠": "Muzo Emerald", "鸽血红": "Pigeon's Blood", "黑奥尔洛夫": "Black Orlov"}
COLOR_EN = {"钻石": "Diamond", "蓝宝石": "Sapphire", "翡翠": "Emerald",
            "红宝石": "Ruby", "玛瑙": "Onyx"}
# 颜色拼接的动态句（卡牌小字/角标/title）：每个颜色各一版
for cn, en in COLOR_EN.items():
    WORDS["买后永久 +1 %s折扣" % cn] = "after buying: permanent +1 %s discount" % en
    WORDS["购买后 +1 %s折扣" % cn] = "after buying: +1 %s discount" % en
for cn, en in COLOR_EN.items():
    for zh, eg in L1.items():
        WORDS[cn + zh] = en + " " + eg
    for zh, eg in L2.items():
        WORDS[cn + zh] = en + " " + eg
for zh, eg in L3.items():
    WORDS[zh] = eg

# ---------- 5. 动态句 PATTERNS ----------
# (regex source, replacement template using $1.. ; 捕获组中的实体名由 WORDS 后处理)
PATTERNS = [
    # ---- 日志 ----
    [r"^(.+) 选择了 (.+?)·(.+)$", "$1 chose $2·$3"],
    [r"^先手：(.+)$", "First: $1"],
    [r"^(.+) 狂欢结束，退还 (\d+) 枚至桌上$", "$1's revelry ended, returned $2 to the table"],
    [r"^对局超长，按当前声望结算$", "Game overran; settled by current prestige"],
    [r"^(.+) 完成神谕·(.+?)，直接获胜！$", "$1 completed Oracle·$2, winning outright!"],
    [r"^游戏结束$", "Game over"],
    [r"^(.+)（狄俄尼索斯）宝石最少，酒神再赐一枚$", "$1 (Dionysus) had fewest gems; Dionysus grants one more"],
    [r"^(.+) 获得 (.+?) \+(\d+)声望$", "$1 gained $2 +$3 prestige"],
    [r"^新的贵族 (.+?) 来到桌面$", "A new noble, $1, arrives at the table"],
    [r"^丘比特（(.+)）暗中牵线 \+2声望$", "Cupid ($1) secretly connects, +2 prestige"],
    [r"^(.+) 施下诅咒：其他角色不得拿取(.+?)$", "$1 casts a curse: others may not take $2"],
    [r"^(.+) 于狂欢中获得 (.+?)$", "$1 gained $2 during the revelry"],
    [r"^(.+) 得酒神赐福：(.+?)$", "$1 received Dionysus's blessing: $2"],
    [r"^赫拉（(.+)）拒绝了 (.+?)，获得 1 声望$", "Hera ($1) declined $2, gaining 1 prestige"],
    [r"^(.+) 无事可做，暂过一回合$", "$1 had nothing to do, passing a turn"],
    [r"^(.+) 点金：一枚(.+?)化作黄金$", "$1's touch: one $2 turned to gold"],
    [r"^(.+) 拿取 (.+?)(?: 并得 1 黄金)?$", "$1 took $2"],
    [r"^太阳战车：弃(.+?)换得一金$", "Sun-Chariot: discarded $1 for 1 gold"],
    [r"^(.+) 从 (.+?) 处窃取了 (.+?)$", "$1 stole $3 from $2"],
    [r"^(.+) 压住了 (.+?)(?:，得 1 黄金)?（他人暂不可接待）$", "$1 pinned $2 (others can't receive for now)"],
    [r"^(.+) 退还 (.+?) 到牌池$", "$1 returned $2 to the pool"],
    [r"^(.+) 筹码已满，预留未获得黄金$", "$1's tokens are full; reserve gained no gold"],
    [r"^(.+) 预留了一张卡(?: 并获得黄金)?$", "$1 reserved a card"],
    [r"^(.+) 购买 (.+?)(?: \+(\d+)声望)?$", "$1 bought $2"],
    [r"^(.+) 盗取了 (.+?) 的宝石之力（余 (\d+) 次）$", "$1 stole the gem-power of $2 ($3 uses left)"],
    [r"^(.+) 将一张 (\d+) 级明牌 (.+?) 埋入牌底$", "$1 buried a level-$2 face-up card, $3, to the bottom"],
    # ---- toast（固定）----
    [r"^操作未被接受：(.+)$", "Action not accepted: $1"],
    [r"^还没轮到你$", "It's not your turn yet"],
    [r"^你的宝石已达上限，无法再拿（点「跳过」继续）$", "Your gems are at the cap, can't take more (tap 'Skip' to continue)"],
    [r"^手中筹码已满 10 枚 —— 先「退还宝石」腾出空间，或直接买牌$", "Hand tokens are full at 10 — first 'Return Gems' to free space, or just buy a card"],
    [r"^法厄同必须拿满三种不同色，不能拿同色一对$", "Phaethon must take a full set of three colors; cannot take a pair of one color"],
    [r"^酒神赐福阶段：先领一枚宝石$", "Dionysus's Blessing phase: take a gem first"],
    [r"^只能埋掉同级明牌$", "You can only bury a face-up card of the same level"],
    [r"^无效操作：(.+)$", "Invalid action: $1"],
    [r"^网络动作超时已复位 —— 请重新操作；若反复出现请刷新页面$", "Network action timed out and reset — please retry; if it repeats, refresh the page"],
    [r"^已尝试上报当前局面$", "Current board state has been reported"],
    [r"^该房间的神谕目标与所选神冲突，请另选一位$", "This room's Oracle goal conflicts with the chosen god; please pick another"],
    [r"^本局神谕与所选神冲突，已取消选中$", "This game's Oracle conflicts with the chosen god; selection cleared"],
    [r"^这个神已被对手选走$", "This god has already been taken by your opponent"],
    [r"^这个神与本局神谕目标冲突，已被禁用$", "This god conflicts with the Oracle goal and is disabled"],
    [r"^先选一位神祇$", "Pick a god first"],
    [r"^先选一位神祇再创建房间$", "Pick a god before creating a room"],
    [r"^房间码是 6 位字母数字$", "The room code is 6 letters and digits"],
    [r"^这个房间是神战模式，先选一位神祇$", "This room is God War mode; pick a god first"],
    [r"^链接已复制，发给好友即可$", "Link copied — send it to a friend"],
    [r"^复制失败，请手动选中链接$", "Copy failed; please select the link manually"],
    [r"^宝石超限！请点击【你自己面板】里的宝石，选 (\d+) 枚退还$", "Token overflow! Tap the gems in [Your Panel] and return $1"],
    [r"^桌上(.+?)只剩 (\d+) 枚 —— 拿同色一对需该色 ≥4 枚，现在只能拿 1 枚$", "Only $2 $1 left on the table — a pair needs ≥4 of that color, so you can take only 1 now"],
    [r"^买不起 (.+?) —— 还差 (\d+) 枚$", "Can't afford $1 — $2 more to go"],
    [r"^(.+) 拿取了宝石$", "$1 took gems"],
    [r"^(.+) 购入 (.+?)(?:，\+(\d+) 声望)?$", "$1 bought $2"],
    [r"^(.+) 预留了 (.+?)(?:，得 1 黄金)?$", "$1 reserved $2"],
    [r"^✨ (.+) 迎来贵族 (.+?)，\+(\d+) 声望$", "✨ $1 welcomes noble $2, +$3 prestige"],
    [r"^(.+) 退还了宝石$", "$1 returned gems"],
    [r"^✨ (.+) 点石成金：弃二换一金$", "✨ $1's Midas Touch: discard two for one gold"],
    [r"^🕵️ (.+) 窃取了 (.+?)$", "🕵️ $1 stole $2!"],
    [r"^🐍 (.+) 下咒：(.+?) 被封$", "🐍 $1 cast a curse: $2 is locked"],
    [r"^🔥 (.+) 盗取 (.+?) 的宝石之力$", "🔥 $1 stole the gem-power of $2"],
    [r"^🌀 (.+) 将 (.+?) 埋入牌底$", "🌀 $1 buried $2 to the bottom"],
    [r"^⚖️ 赫拉行使否决：(.+) 本回合不得接待，赫拉 \+1 声望$", "⚖️ Hera vetoes: $1 may not receive this turn, Hera +1 prestige"],
    [r"^⚖️ 赫拉恩准了 (.+) 的来访$", "⚖️ Hera approved $1's visit"],
    [r"^♻️ (.+) 退还 (.+?) 回牌池$", "♻️ $1 returned $2 to the pool"],
    [r"^🍷 (.+) 宝石最少，酒神赐福：可再取一枚$", "🍷 $1 had fewest gems; Dionysus's blessing: take one more"],
    [r"^🍷 酒神赐福：(.+) 得 (.+?)$", "🍷 Dionysus's blessing: $1 gained $2"],
    [r"^💘 丘比特牵线成功：(.+) \+(\d+) 声望$", "💘 Cupid's match succeeded: $1 +$2 prestige"],
    [r"^🍷 狂欢结束：(.+) 退还 (\d+) 枚宝石$", "🍷 Revelry ended: $1 returned $2 gems"],
    [r"^⚜ (.+) 完成神谕·(.+?)，直接获胜！$", "⚜ $1 completed Oracle·$2, winning outright!"],
    [r"^创建失败：(.+)$", "Create failed: $1"],
    [r"^加入失败：(.+)$", "Join failed: $1"],
    [r"^开局失败：(.+)$", "Start failed: $1"],
]

# ---------- 5.5 额外手工补充（采集器未覆盖的叶子文本）----------
# 例：被 <b>数字</b> 拆成两个文本节点的句子、游戏标题、页面 <title> 等。
# 以「合成 block」方式并入，使其走 TEXT 词典（无内联标签）。
EXTRA = {
    "宝石商人 · 璀璨商路": "Gem Merchant · The Lustrous Trade Route",
    "每回合拿宝石 / 预留 / 购牌 三选一 · 达到": "Each turn: take gems / reserve / buy — pick one · reach",
    "声望触发终局 · 率先达线者胜": "prestige to trigger the endgame · first to cross the line wins",
    "宝石商人与诸神": "Gem Merchants & The Gods",
}
for _k, _v in EXTRA.items():
    if _k not in TR:
        TR[_k] = _v
    blocks.append({"zh": _k, "html": _k, "tag": "div", "n": 1})

# ---------- 6. 写出 i18n_en.js ----------
def jsesc(s):
    return s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n")

lines = []
lines.append("/* ===== i18n 英文翻译数据（由 tools/build_i18n_en.py 自动生成） ===== */")
lines.append("window.I18N_DATA = {")
lines.append("  HTML: {")
for i, b in enumerate(blocks):
    zh = b["zh"]
    en = TR.get(zh)
    if en is None:
        continue  # 未翻译的跳过（保持中文）
    if "<" in b["html"]:
        lines.append("    %s: '%s'%s" % (json.dumps(zh, ensure_ascii=False), jsesc(en), "," if i < len(blocks)-1 else ""))
lines.append("  },")
lines.append("  TEXT: {")
any_text = False
for i, b in enumerate(blocks):
    zh = b["zh"]
    en = TR.get(zh)
    if en is None or "<" in b["html"]:
        continue
    any_text = True
    lines.append("    %s: '%s'%s" % (json.dumps(zh, ensure_ascii=False), jsesc(en), "," if i < len(blocks)-1 else ""))
lines.append("  },")
lines.append("  ATTR: {")
for i, a in enumerate(attrs):
    en = ATTR.get(a)
    if en is None:
        continue
    lines.append("    %s: '%s'%s" % (json.dumps(a, ensure_ascii=False), jsesc(en), "," if i < len(attrs)-1 else ""))
lines.append("  },")
lines.append("  WORDS: {")
wk = list(WORDS.keys())
for i, k in enumerate(wk):
    lines.append("    %s: '%s'%s" % (json.dumps(k, ensure_ascii=False), jsesc(WORDS[k]), "," if i < len(wk)-1 else ""))
lines.append("  },")
lines.append("  PATTERNS: [")
for i, (re_src, tpl) in enumerate(PATTERNS):
    lines.append("    [new RegExp(%s, 'm'), '%s']%s" % (json.dumps(re_src), jsesc(tpl), "," if i < len(PATTERNS)-1 else ""))
lines.append("  ]")
lines.append("};")
lines.append("")
# 统计未翻译
missing = [b["zh"] for b in blocks if b["zh"] not in TR]
print("blocks total:", len(blocks), "translated:", len(blocks)-len(missing))
print("missing blocks:", len(missing))
for m in missing[:40]:
    print("  MISS:", m[:60])
out = "\n".join(lines)
open(os.path.join(ROOT, "i18n_en.js"), "w", encoding="utf-8").write(out)
print("written i18n_en.js (%d bytes)" % len(out))
