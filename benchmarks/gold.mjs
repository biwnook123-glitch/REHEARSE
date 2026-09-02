export const BENCHMARK_VERSION = '0.1.0';

export const GOLD_CASES = {
  gala: {
    title: '东方生活美学品牌盛典', date: '2026-10-24', venue: '城市会展中心 A 馆',
    source: { name: '东方生活美学品牌盛典.csv', firstRow: 6 },
    moments: [
      '10:00|全场技术联排|90分钟', '12:00|嘉宾与演员签到|60分钟', '13:30|观众入场|30分钟',
      '14:00|开场国风影片|5分钟', '14:05|品牌主题演讲|3分钟', '14:08|国风大赏主秀|35分钟',
      '15:10|互动抽奖|15分钟', '15:30|产品体验与直播连线|25分钟', '16:10|全员合影|15分钟',
    ],
    dimensions: ['people', 'space', 'resource', 'audience', 'channel', 'contingency'],
    compileFindings: [],
    requiredRisks: ['备援|开场国风影片', '备援|国风大赏主秀', '合规|产品体验与直播连线', '库存|产品体验与直播连线'],
  },
  launch: {
    title: '智能生活新品发布会', date: '2026-12-08', venue: '品牌体验中心',
    source: { name: '智能生活新品发布会.csv', firstRow: 6 },
    moments: [
      '13:30|媒体签到|30分钟', '14:00|开场影片|4分钟', '14:04|品牌主题演讲|16分钟',
      '14:20|旗舰手机现场演示|15分钟', '14:35|智能家居联动演示|12分钟', '14:50|媒体问答|20分钟',
    ],
    dimensions: ['people', 'space', 'resource', 'channel', 'contingency', 'approval'],
    compileFindings: [
      '开场影片|resource', '品牌主题演讲|duration', '品牌主题演讲|people', '旗舰手机现场演示|time',
      '旗舰手机现场演示|duration', '旗舰手机现场演示|resource', '智能家居联动演示|time', '媒体问答|time',
    ],
    requiredRisks: ['备援|旗舰手机现场演示', '合规|旗舰手机现场演示', '备援|智能家居联动演示'],
  },
  beauty: {
    title: '城市美妆体验节', date: '2026-09-26', venue: '创意园区',
    source: { name: '城市美妆体验节.csv', firstRow: 6 },
    moments: [
      '09:00|VIP提前入场|60分钟', '10:00|公众分时入场|180分钟', '10:20|品牌主理人课堂|40分钟',
      '11:10|新品试妆体验|90分钟', '13:30|美妆达人见面会|45分钟', '15:00|限定礼盒领取|60分钟',
    ],
    dimensions: ['people', 'space', 'resource', 'audience', 'channel', 'contingency', 'inventory'],
    compileFindings: [],
    requiredRisks: ['合规|新品试妆体验', '库存|新品试妆体验'],
  },
  convention: {
    title: '年度伙伴成长大会', date: '2026-11-21', venue: '国际会议中心',
    source: { name: '年度伙伴成长大会.csv', firstRow: 6 },
    moments: [
      '08:30|伙伴报到|60分钟', '09:30|年度主题演讲|35分钟', '10:10|产品科研与健康讲解|40分钟',
      '11:00|优秀伙伴故事分享|35分钟', '14:00|年度表彰典礼|70分钟', '15:30|区域行动工作坊|60分钟',
      '17:00|全场合唱与合影|25分钟',
    ],
    dimensions: ['people', 'space', 'resource', 'audience', 'contingency', 'approval'],
    compileFindings: [],
    requiredRisks: ['合规|产品科研与健康讲解'],
  },
  roadshow: {
    title: '多城健康消费嘉年华', date: '2026-03-15', venue: '中山主会场 + 23城分会场',
    source: { name: '多城健康消费嘉年华.csv', firstRow: 6 },
    moments: [
      '09:30|主会场启动仪式|20分钟', '10:00|23城分会场同步开场|15分钟', '10:20|健康知识科普|35分钟',
      '11:10|产品互动体验|80分钟', '14:00|消费者权益互动问答|40分钟', '16:00|各城市闭场回传|30分钟',
    ],
    dimensions: ['people', 'space', 'resource', 'audience', 'channel', 'contingency', 'approval', 'inventory'],
    compileFindings: [],
    requiredRisks: ['合规|健康知识科普', '库存|产品互动体验'],
  },
  market: {
    title: '城市健康生活市集', date: '2026-10-18', venue: '滨江公园',
    source: { name: '城市健康生活市集.csv', firstRow: 6 },
    moments: [
      '09:00|摊主签到|30分钟', '09:30|晨间巡检|20分钟', '10:00|市集开放|120分钟',
      '12:00|养生工坊|45分钟', '14:00|国风巡游|30分钟', '16:30|闭市清场|30分钟',
    ],
    dimensions: ['people', 'space', 'resource', 'audience'],
    compileFindings: [],
    requiredRisks: ['备援|摊主签到', '动线|摊主签到', '动线|国风巡游'],
  },
  training: {
    title: '区域伙伴产品训练营', date: '2026-11-06', venue: '培训中心 A3',
    source: { name: '区域伙伴训练营.txt', firstRow: 5 },
    moments: [
      '08:30|学员签到|', '09:00|产品知识讲解|', '10:20|分组案例演练|', '11:20|成果发表|', '12:00|结业与反馈|',
    ],
    dimensions: ['people', 'space', 'resource', 'channel'],
    compileFindings: [],
    requiredRisks: [
      '时间|学员签到', '时间|产品知识讲解', '时间|分组案例演练', '时间|成果发表', '时间|结业与反馈',
      '合规|产品知识讲解',
    ],
  },
};
