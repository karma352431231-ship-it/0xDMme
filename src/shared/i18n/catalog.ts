/** Authored app text. Tuple order: English, Simplified Chinese. */
export const catalog: Record<string, readonly [string, string]> = {
  'contacts.settings-saved-refresh-failed': [
    'Contact saved. The contact list could not refresh; reopen Contacts to check it.',
    '联系人已保存，但联系人列表无法刷新；请重新打开联系人页面查看。',
  ],
  'html.contact-settings': [
    '<header><div><span class="contact-eyebrow">YOUR CONTACTS</span><h2 id="contact-settings-title">Contact settings</h2></div><button data-contact-settings-close class="contact-close" type="button" aria-label="Close contact settings">{0}</button></header><form><div class="contact-settings-identity"><strong data-contact-name></strong><p data-contact-identity></p></div><label>Private nickname<input data-contact-alias maxlength="80" autocomplete="off"></label><p class="contact-hint">Only you see this name. Saving does not send or accept a chat request.</p><div data-contact-versions></div><button type="submit" class="primary">Save changes</button><p data-contact-settings-status role="status"></p></form>',
    '<header><div><span class="contact-eyebrow">你的联系人</span><h2 id="contact-settings-title">联系人设置</h2></div><button data-contact-settings-close class="contact-close" type="button" aria-label="关闭联系人设置">{0}</button></header><form><div class="contact-settings-identity"><strong data-contact-name></strong><p data-contact-identity></p></div><label>私密备注名<input data-contact-alias maxlength="80" autocomplete="off"></label><p class="contact-hint">只有你能看到此名称。保存不会发送或接受聊天申请。</p><div data-contact-versions></div><button type="submit" class="primary">保存更改</button><p data-contact-settings-status role="status"></p></form>',
  ],
  'Added via invitation': ['Added via invitation', '通过邀请添加'],
  'Contact origin not recorded': [
    'Contact origin not recorded',
    '未记录联系人的添加方式',
  ],
  'Resolve saved versions': ['Resolve saved versions', '解决已保存版本冲突'],
  'Contact changes saved.': ['Contact changes saved.', '联系人更改已保存。'],
  'Who can request a private chat': [
    'Who can request a private chat',
    '谁可以申请私密聊天',
  ],
  'Invite people yourself': ['Invite people yourself', '由你主动分享邀请'],
  'Let people find your exact wallet': [
    'Let people find your exact wallet',
    '允许通过完整钱包地址找到你',
  ],
  'Stop new chat requests': ['Stop new chat requests', '停止接收新的聊天申请'],
  'Explain: {0}': ['Explain: {0}', '说明：{0}'],
  'Only people with your active invitation link can find your private account and request a chat. You choose whether to accept. Replacing or revoking the link stops new requests through the old link. Approved contacts keep access.':
    [
      'Only people with your active invitation link can find your private account and request a chat. You choose whether to accept. Replacing or revoking the link stops new requests through the old link. Approved contacts keep access.',
      '只有持有你的有效邀请链接的人才能找到你的私密账户并申请聊天。由你决定是否接受。更换或撤销链接后，旧链接无法发起新申请。已批准联系人仍可与你聊天。',
    ],
  'Anyone with your complete wallet address or active invitation link can find your private account and request a chat. You must accept before they can message you. This does not publish your wallet in a directory.':
    [
      'Anyone with your complete wallet address or active invitation link can find your private account and request a chat. You must accept before they can message you. This does not publish your wallet in a directory.',
      '知道你的完整钱包地址或持有有效邀请链接的人可以找到你的私密账户并申请聊天。你接受后，对方才能发送消息。这不会将你的钱包发布到公开目录。',
    ],
  'Only contacts you have already approved can chat with you. New requests are disabled, including requests through your invitation link or exact wallet address. Existing contacts stay approved.':
    [
      'Only contacts you have already approved can chat with you. New requests are disabled, including requests through your invitation link or exact wallet address. Existing contacts stay approved.',
      '只有你已批准的联系人可以与你聊天。停止接收所有新申请，包括通过邀请链接或完整钱包地址发起的申请。现有联系人保持已批准状态。',
    ],
  'calls.test-tone-explanation': [
    'Sends one quiet, generated beep to the other person instead of your microphone for about one second, then restores your microphone. It records nothing. Available only with your microphone on.',
    '用一个轻柔的合成提示音代替麦克风音频发送给对方，持续约一秒，然后恢复麦克风。不录制任何内容。仅在麦克风开启时可用。',
  ],
  'calls.test-tone-send': ['Send one test beep', '发送一个测试提示音'],
  'calls.test-tone-sending': [
    'Sending one test beep…',
    '正在发送一个测试提示音…',
  ],
  'calls.test-tone-sent': [
    'Test finished; microphone restored.',
    '测试结束，麦克风已恢复。',
  ],
  'calls.test-tone-failed': [
    'Audio test could not finish. End this call before trying again.',
    '无法完成音频测试。请结束本次通话后重试。',
  ],
  'calls.audio-check-stop-capture': [
    'Test listening without microphone',
    '测试关闭麦克风后的收听',
  ],
  'calls.audio-check-stop-capture-explanation': [
    'For diagnosis: closes this microphone until you end the call. You can still hear the other person, but they will not hear you. Start a new call to speak again.',
    '仅用于诊断：关闭本次通话的麦克风，直到通话结束。你仍能听到对方，但对方将听不到你。要再次说话，请开始新通话。',
  ],
  'calls.audio-check-stopping-capture': [
    'Closing microphone…',
    '正在关闭麦克风…',
  ],
  'calls.capture-stopped': [
    'Audio test: microphone closed until this call ends. You can still hear the other person.',
    '音频测试：麦克风已关闭，直到本次通话结束。你仍能听到对方。',
  ],
  'calls.audio-check-stop-failed': [
    'Could not finish the microphone test. End this call before trying again.',
    '无法完成麦克风测试。请结束本次通话后重试。',
  ],
  'calls.audio-check': ['Audio check', '音频检查'],
  'calls.audio-check-privacy': [
    'Checks technical counters and microphone settings in this tab. Includes no audio, messages, addresses or credentials. Nothing is sent automatically.',
    '仅在此标签页检查技术计数和麦克风设置。不包含音频、消息、地址或凭证。不会自动发送任何内容。',
  ],
  'calls.audio-check-run': ['Check call audio', '检查通话音频'],
  'calls.audio-check-copy': ['Copy report', '复制报告'],
  'calls.audio-check-report': [
    'Call audio technical report',
    '通话音频技术报告',
  ],
  'calls.audio-check-running': ['Checking audio…', '正在检查音频…'],
  'calls.audio-check-ready': [
    'Report ready. Copy it only if you want to share it for support.',
    '报告已生成。仅在你希望向支持人员分享时复制。',
  ],
  'calls.audio-check-failed': [
    'Could not check audio. Keep the call connected and try again.',
    '无法检查音频。请保持通话连接后重试。',
  ],
  'calls.audio-check-copied': ['Report copied.', '报告已复制。'],
  'calls.audio-check-copy-failed': [
    'Could not copy. Select and copy the report manually.',
    '无法复制。请手动选择并复制报告。',
  ],
  'chat.outgoing-message': ['Your message', '你的消息'],
  'chat.composed-at {0}': ['Written at {0}', '撰写于 {0}'],
  'chat.send-failed': [
    'Message could not be sent. Try again.',
    '消息未能发送。请重试。',
  ],
  'chat.retry-send': ['Retry sending message', '重试发送消息'],
  'chat.saving-local': [
    'Saving message on this device…',
    '正在将消息保存到此设备…',
  ],
  'chat.save-failed': [
    'Message not saved. Retry before closing this page.',
    '消息尚未保存。请在关闭此页面前重试。',
  ],
  'chat.retry-save': ['Retry saving message', '重试保存消息'],
  'preview.audio': ['Voice message', '语音消息'],
  'preview.unavailable': ['Message preview unavailable.', '无法显示消息预览。'],
  'Message action target is unavailable.': [
    'This message is no longer available for this action.',
    '此消息已无法进行此操作。',
  ],
  'Message action limit reached.': [
    'This message has reached its edit and reaction limit.',
    '该消息的编辑和回应次数已达上限。',
  ],
  'Invalid public-identity message or action.': [
    'This message or action is unavailable in handle chats.',
    '用户名聊天中不支持此消息或操作。',
  ],
  'message.sent-at {0}': ['Sent at {0}', '发送于 {0}'],
  'message.remove-reaction {0} {1}': [
    'Remove my {0} reaction · {1}',
    '移除我的 {0} 回应 · {1}',
  ],
  'message.reaction {0} {1}': ['{0} reaction · {1}', '{0} 回应 · {1}'],
  'forward.choose-contact': ['Forward to', '转发至'],
  'forward.more': ['Load more contacts', '加载更多联系人'],
  'forward.search': ['Search contacts', '搜索联系人'],
  'forward.empty': ['No approved contacts found.', '未找到已批准的联系人。'],
  'forward.photo-unavailable': [
    'Contact photo unavailable.',
    '无法显示联系人照片。',
  ],
  'forward.contacts-unavailable': [
    'Could not load contacts.',
    '无法加载联系人。',
  ],
  'forward.selected {0}': ['{0} selected', '已选择 {0} 条'],
  'forward.select-message': ['Select message to forward', '选择要转发的消息'],
  'forward.pending-target': [
    'Retry forwarding to the same contact to finish the pending send.',
    '请重试转发给同一联系人，以完成待发送的消息。',
  ],
  'Invalid message time.': ['Invalid message time.', '消息时间无效。'],
  'Invalid message presentation.': [
    'Invalid message presentation.',
    '消息显示信息无效。',
  ],
  'Invalid message reaction.': ['Invalid message reaction.', '消息回应无效。'],
  'Reaction target is unavailable.': [
    'The message is no longer available for reactions.',
    '该消息已无法回应。',
  ],
  'Message reaction limit reached.': [
    'This message has reached its reaction limit.',
    '该消息的回应次数已达上限。',
  ],
  'DM accepts text, declared media and reactions; private profile and edits are forbidden.':
    [
      'This chat accepts text, media and reactions; private profile cards and edits are unavailable.',
      '此聊天支持文字、媒体和回应，不支持私密资料卡和编辑。',
    ],
  'follow.community': ['Community', '社区'],
  'follow.user': ['User', '用户'],
  'upvote.heading': ['Upvotes', '赞同'],
  '@{0} upvoted your post': ['@{0} upvoted your post', '@{0} 赞同了你的帖子'],
  '@{0} and {1} others upvoted your post': [
    '@{0} and {1} others upvoted your post',
    '@{0} 和其他 {1} 人赞同了你的帖子',
  ],
  '@{0} upvoted your reply': ['@{0} upvoted your reply', '@{0} 赞同了你的回复'],
  '@{0} and {1} others upvoted your reply': [
    '@{0} and {1} others upvoted your reply',
    '@{0} 和其他 {1} 人赞同了你的回复',
  ],
  'upvote.show': ['View who upvoted', '查看赞同者'],
  'upvote.more': ['Next page', '下一页'],
  'upvote.loading': ['Loading upvotes…', '正在加载赞同…'],
  'upvote.empty': ['No upvotes yet.', '暂无赞同。'],
  'Invalid upvote notice.': ['Invalid upvote notice.', '赞同通知无效。'],
  'Upvote read unavailable.': [
    'Could not mark upvotes as read.',
    '无法将赞同标记为已读。',
  ],

  'post.edited': [' · Edited', ' · 已编辑'],
  'thread.load-remaining': ['Load remaining replies', '加载其余回复'],
  'activity.now': ['Now', '刚刚'],
  'contacts.request-sent-save-failed': [
    'Request sent, but the contact could not be saved. Refresh contacts before trying again.',
    '请求已发送，但无法保存联系人。请刷新联系人后再试。',
  ],
  '{0} loaded': ['{0} loaded', '已加载 {0} 个'],
  'contacts.edit': ['Edit contact', '编辑联系人'],
  'contacts.waiting': [
    'Request sent · Waiting for acceptance',
    '请求已发送 · 等待接受',
  ],
  'contacts.saved-only': [
    'Saved contact · Conversation not yet approved',
    '已保存联系人 · 聊天尚未获准',
  ],
  'contacts.empty': [
    'No contacts in the loaded items. Add a contact or send an invitation.',
    '已加载的项目中没有联系人。请添加联系人或发送邀请。',
  ],

  'Community topics · {0}/2 selected (required)': [
    'Community topics · {0}/2 selected (required)',
    '社区主题 · 已选 {0}/2（必选）',
  ],
  'community.topics.filter': ['Filter by topic', '按主题筛选'],
  'community.topics.toggle': ['Topics', '主题'],
  'community.topics.toggle-count {0}': ['Topics · {0}', '主题 · {0}'],
  'Invalid publication mode.': ['Invalid publication mode.', '发布模式无效。'],
  'community.content-policy': [
    'Mark your community NSFW if it will contain sexually explicit content, including AI-generated images or drawings. Keep explicit content out of unmarked communities.',
    '如果社区将包含露骨色情内容（包括 AI 生成的图片或绘画），请将其标记为 NSFW。未标记的社区不得发布露骨内容。',
  ],
  'community.nsfw.label': ['NSFW · Explicit content', 'NSFW · 露骨内容'],
  'community.nsfw.hint': [
    'Enable this if your community will contain sexually explicit content, including AI-generated images or drawings.',
    '如果社区将包含露骨色情内容（包括 AI 生成的图片或绘画），请启用此选项。',
  ],
  'community.nsfw.save': ['Save NSFW designation', '保存 NSFW 标记'],
  'community.topics.title': [
    'What is this community about?',
    '这个社区的主题是什么？',
  ],
  'community.topics.fixed-hint': [
    'Choose one or two topics. They cannot be changed after creation.',
    '请选择一至两个主题。创建后无法更改。',
  ],
  'community.publication.unreviewed': [
    'Published without automatic analysis. Automatic moderation is temporarily paused.',
    '已发布，未进行自动分析。自动审核已暂时停用。',
  ],
  'community.publication.images': [
    'Images are published after file preparation. Automatic content analysis is temporarily paused.',
    '图片将在文件处理完成后发布。自动内容分析已暂时停用。',
  ],
  'community.publication.preview': [
    'Changes stay as a preview on this device until you confirm. Confirmed images are published without automatic content analysis.',
    '更改在确认前仅在此设备上预览。确认后的图片将直接发布，不进行自动内容分析。',
  ],
  'Choose at least one community topic.': [
    'Choose at least one community topic.',
    '请至少选择一个社区主题。',
  ],
  'Invalid community topics.': [
    'Choose distinct topics from the available list. New communities can have up to two topics.',
    '请选择列表中不同的主题。新社区最多可选择两个主题。',
  ],
  'Invalid NSFW choice.': [
    'Choose whether this community contains explicit content.',
    '请选择此社区是否包含露骨内容。',
  ],
  'Community page too large.': ['Community page too large.', '社区页面过大。'],
  'Community creation classification already fixed.': [
    'This creation request already has different fixed topics or NSFW settings.',
    '此创建请求已有不同的固定主题或 NSFW 设置。',
  ],
  'Classification is available only for new communities.': [
    'Classification is available only for new communities.',
    '分类仅适用于新创建的社区。',
  ],
  'community.topic.ai': ['AI', 'AI'],
  'community.topic.cat': ['Cat', '猫'],
  'community.topic.dog': ['Dog', '狗'],
  'community.topic.meme': ['Meme', '表情包'],
  'community.topic.tech': ['Tech', '科技'],
  'community.topic.stock': ['Stock', '股票'],
  'community.topic.chinese': ['Chinese', '中文'],
  'community.topic.brainrot': ['BrainRot', '抽象梗'],
  'community.topic.celebrity': ['Celebrity', '名人'],
  'community.topic.nft': ['NFT', 'NFT'],
  'community.topic.tiktok': ['TikTok', 'TikTok'],
  'Arquivo da análise indisponível.': [
    'Review media unavailable.',
    '分析媒体不可用。',
  ],
  'Carregando a mídia…': ['Loading media…', '正在加载媒体…'],
  'Mídia restrita à sua conta': [
    'Media restricted to your account',
    '仅限你的账号查看的媒体',
  ],
  'Este arquivo não está mais disponível. Ele pode ter sido substituído, removido ou atingido o prazo de retenção.':
    [
      'This file is no longer available. It may have been replaced, removed, or reached its retention deadline.',
      '此文件已不可用。它可能已被替换、移除或达到保留期限。',
    ],
  'community.profile-invitation.title': [
    'Want to participate?',
    '想参与讨论？',
  ],
  'community.profile-invitation.link': [
    'Create your public profile here',
    '在此创建你的公开个人资料',
  ],
  'wallet.available': ['Available', '可用'],
  'wallet.not-detected': ['Not detected', '未检测到'],
  'Idioma salvo.': ['Language saved.', '语言已保存。'],
  ', que você segue': [', which you follow', '，你已关注'],
  ': heartbeat': [': heartbeat', '：心跳'],
  '{0} — {1}': ['{0} — {1}', '{0} — {1}'],
  '{0} · {1}': ['{0} · {1}', '{0} · {1}'],
  '{0} · {1} · {2}': ['{0} · {1} · {2}', '{0} · {1} · {2}'],
  '{0} · {1} na fila': ['{0} · {1} queued', '{0} · 队列中有 {1} 项'],
  '{0} · {1}. Confirme somente o pedido que você iniciou. A wallet pedirá assinaturas para entrar e abrir seus dados cifrados no navegador original. Não há transação ou autorização de tokens.':
    [
      '{0} · {1}. Only confirm a request you started. Your wallet will ask for signatures to sign in and open your encrypted data in the original browser. No transaction or token approval is requested.',
      '{0} · {1}。请仅确认你自己发起的请求。钱包将请求签名，以登录并在原浏览器中打开加密数据。这不会发起交易或授权代币。',
    ],
  '{0} · {1}. Nome escolhido pelo usuário.': [
    '{0} · {1}. User-chosen name.',
    '{0} · {1}。用户自行设置的名称。',
  ],
  '{0} · {1}{2}': ['{0} · {1}{2}', '{0} · {1}{2}'],
  '{0} · #{1} · {2}': ['{0} · #{1} · {2}', '{0} · #{1} · {2}'],
  '{0} · 0xDMme': ['{0} · 0xDMme', '{0} · 0xDMme'],
  '{0} · impressão {1}': ['{0} · fingerprint {1}', '{0} · 指纹 {1}'],
  '{0} · inferência {1} s': ['{0} · inference {1} s', '{0} · 推理耗时 {1} 秒'],
  '{0} · nome escolhido pelo usuário · {1} · {2}': [
    '{0} · user-chosen name · {1} · {2}',
    '{0} · 用户自行设置的名称 · {1} · {2}',
  ],
  '{0} · versão {1}': ['{0} · version {1}', '{0} · 版本 {1}'],
  '{0} [{1} · {2} · {3} · {4}]': [
    '{0} [{1} · {2} · {3} · {4}]',
    '{0} [{1} · {2} · {3} · {4}]',
  ],
  '{0} {1}': ['{0} {1}', '{0} {1}'],
  '{0} {1} {2}': ['{0} {1} {2}', '{0} {1} {2}'],
  '{0} {1}.': ['{0} {1}.', '{0} {1}。'],
  '{0} {1}{2}': ['{0} {1}{2}', '{0} {1}{2}'],
  '{0} a comunidade {1}': ['{0} the community {1}', '{0}社区 {1}'],
  '{0} casos · {1} MiB · expira até {2}.': [
    '{0} cases · {1} MiB · expires by {2}.',
    '{0} 个案例 · {1} MiB · 将于 {2} 前过期。',
  ],
  '{0} convidou você para um grupo': [
    '{0} invited you to a group',
    '{0} 邀请你加入群组',
  ],
  '{0} convidou você para um grupo.': [
    '{0} invited you to a group.',
    '{0} 邀请你加入群组。',
  ],
  '{0} de {1}': ['{0} of {1}', '{0} / {1}'],
  '{0} em {1}': ['{0} in {1}', '{0}，来自 {1}'],
  '{0} GB': ['{0} GB', '{0} GB'],
  '{0} MB': ['{0} MB', '{0} MB'],
  '{0} MB usados · {1} MB disponíveis de {2} MB': [
    '{0} MB used · {1} MB available out of {2} MB',
    '已使用 {0} MB · 总共 {2} MB，可用 {1} MB',
  ],
  '{0} mensagens não lidas': ['{0} unread messages', '{0} 条未读消息'],
  '{0} Nenhum áudio foi enviado automaticamente.': [
    '{0} No audio was sent automatically.',
    '{0} 没有自动发送任何音频。',
  ],
  '{0} ofereceu a propriedade de um grupo': [
    '{0} offered you ownership of a group',
    '{0} 向你转让群组所有权',
  ],
  '{0} ofereceu a propriedade de um grupo. É necessário aceitar para assumir a administração.':
    [
      '{0} offered you ownership of a group. Accept to take over administration.',
      '{0} 向你转让群组所有权。接受后，你将负责管理该群组。',
    ],
  '{0} participantes': ['{0} participants', '{0} 位成员'],
  '{0} posts · {1} respostas': [
    '{0} posts · {1} replies',
    '{0} 篇帖子 · {1} 条回复',
  ],
  '{0} Revisão: {1}': ['{0} Revision: {1}', '{0} 修订版本：{1}'],
  '{0} salvas · {1} passam · {2} bloqueiam · expira em {3} (Fortaleza)': [
    '{0} saved · {1} pass · {2} blocked · expires at {3} (Fortaleza)',
    '已保存 {0} 项 · 通过 {1} 项 · 拦截 {2} 项 · {3} 到期（福塔莱萨时间）',
  ],
  '{0} seguidores': ['{0} followers', '{0} 位关注者'],
  '{0} versões em conflito': ['{0} conflicting versions', '{0} 个冲突版本'],
  '{0} visualizações estimadas': ['{0} estimated views', '约 {0} 次浏览'],
  '{0} votos': ['{0} votes', '{0} 票'],
  '{0}: {1}': ['{0}: {1}', '{0}：{1}'],
  '{0}: {1} — {2}': ['{0}: {1} — {2}', '{0}：{1} — {2}'],
  '{0}:{1} indisponível': ['{0}:{1} unavailable', '{0}:{1} 不可用'],
  '{0}. {1}': ['{0}. {1}', '{0}。{1}'],
  '{0}. Conta de origem: {1} ({2}). Identificador do pacote: {3}.': [
    '{0}. Source account: {1} ({2}). Package ID: {3}.',
    '{0}。来源账户：{1}（{2}）。数据包标识：{3}。',
  ],
  '{0}{1} · {2}': ['{0}{1} · {2}', '{0}{1} · {2}'],
  '{0}{1} · {2}{3}{4}{5}': ['{0}{1} · {2}{3}{4}{5}', '{0}{1} · {2}{3}{4}{5}'],
  '{0}{1} · salvo na agenda': [
    '{0}{1} · saved in contacts',
    '{0}{1} · 已保存到联系人',
  ],
  '{0}{1} nesta página': ['{0}{1} on this page', '此页面上的 {0}{1}'],
  '@ do perfil público': ['Public profile handle', '公开个人资料用户名'],
  '@ público': ['Public handle', '公开用户名'],
  '@{0} {1}': ['@{0} {1}', '@{0} {1}'],
  '@{0} mencionou você': ['@{0} mentioned you', '@{0} 提到了你'],
  '@{0} quer conversar com você.': [
    '@{0} wants to chat with you.',
    '@{0} 想与你聊天。',
  ],
  '@{0}, {1}': ['@{0}, {1}', '@{0}，{1}'],
  '← {0}': ['← {0}', '← {0}'],
  'Voltar ao feed': ['Back to feed', '返回动态'],
  '← Voltar à Atividade': ['← Back to Activity', '← 返回活动'],
  '+ Seguir': ['+ Follow', '+ 关注'],
  '＋ Ver {0} {1}': ['＋ View {0} {1}', '＋ 查看 {0} 条{1}'],
  '＋ Ver {0} outras respostas': [
    '＋ View {0} more replies',
    '＋ 查看另外 {0} 条回复',
  ],
  '＋ Ver {0} respostas': ['＋ View {0} replies', '＋ 查看 {0} 条回复'],
  '×': ['×', '×'],
  '− Recolher respostas': ['− Collapse replies', '− 收起回复'],
  '⌄': ['⌄', '⌄'],
  '0 0 {0} {1}': ['0 0 {0} {1}', '0 0 {0} {1}'],
  '1 dia': ['1 day', '1 天'],
  '24 horas': ['24 hours', '24 小时'],
  '30 dias': ['30 days', '30 天'],
  '7 dias': ['7 days', '7 天'],
  'A ação não foi concluída.': [
    'The action was not completed.',
    '操作未完成。',
  ],
  'A administração só muda depois do seu aceite.': [
    'Administration only changes after you accept.',
    '只有你接受后，管理权才会转移。',
  ],
  'A agenda mudou. Atualize a lista antes de continuar.': [
    'Contacts have changed. Refresh the list before continuing.',
    '联系人已更改。请刷新列表后继续。',
  ],
  'A análise automática indicou conteúdo explícito, proibido pela política pública. Você pode contestar a análise no Perfil.':
    [
      'Automated analysis detected explicit content, which is prohibited by the public content policy. You can appeal in Profile.',
      '自动分析检测到公开内容政策禁止的露骨内容。你可以在“个人资料”中申诉。',
    ],
  'A análise automática não foi concluída.': [
    'Automated analysis was not completed.',
    '自动分析未完成。',
  ],
  'A análise ficou incerta. O conteúdo fica fora do público até uma aprovação. Você pode contestar no Perfil.':
    [
      'The analysis was uncertain. The content will not be public until approved. You can appeal in Profile.',
      '分析结果不确定。在获批前，内容不会公开。你可以在“个人资料”中申诉。',
    ],
  'A análise recusou este arquivo por indicação de conteúdo explícito.': [
    'Analysis rejected this file because it detected explicit content.',
    '分析检测到露骨内容，因此拒绝了此文件。',
  ],
  'A assinatura não pertence à conta do ensaio.': [
    'The signature does not belong to the test account.',
    '签名不属于测试账户。',
  ],
  'A assinatura pertence a outra wallet.': [
    'The signature belongs to another wallet.',
    '签名属于另一个钱包。',
  ],
  'a autorização do aparelho em Perfil → Dispositivos conectados': [
    'device authorization in Profile → Connected devices',
    '“个人资料 → 已连接设备”中的设备授权',
  ],
  'A autorização mudou durante a assinatura. Cancele e confira novamente.': [
    'Authorization changed during signing. Cancel and check again.',
    '签名期间授权已更改。请取消并重新确认。',
  ],
  'A autorização mudou. O app confere o estado atual do aparelho.': [
    "Authorization changed. The app is checking the device's current state.",
    '授权已更改。应用正在检查设备的当前状态。',
  ],
  'A avaliação se aplica à mídia identificada nesta página. Uma contestação permite solicitar a revisão desse resultado.':
    [
      'The assessment applies to the media identified on this page. An appeal requests a review of this result.',
      '评估仅适用于此页面标识的媒体。提交申诉可请求复核该结果。',
    ],
  'A câmera foi encerrada. Tente novamente ou copie o código.': [
    'The camera was stopped. Try again or copy the code.',
    '摄像头已关闭。请重试或复制代码。',
  ],
  'a chamada em andamento': ['the ongoing call', '正在进行的通话'],
  'A chave do outro cliente não confere.': [
    "The other client's key does not match.",
    '另一个客户端的密钥不匹配。',
  ],
  'A comunidade mudou.': ['The community has changed.', '社区已更改。'],
  'A conta ainda não possui chave de recuperação.': [
    'This account does not have a recovery key yet.',
    '此账户尚未设置恢复密钥。',
  ],
  'A conta mudou antes de salvar as configurações.': [
    'The account changed before settings were saved.',
    '保存设置前，账户已更改。',
  ],
  'A conta selecionada não é a conta do pacote.': [
    "The selected account is not the package's account.",
    '所选账户与数据包所属账户不一致。',
  ],
  'A conversa foi bloqueada. Trecho preservado somente como prévia local.': [
    'This conversation was blocked. The excerpt is preserved only as a local preview.',
    '此对话已被屏蔽。片段仅保留为本地预览。',
  ],
  'A cópia salva fica fora do cofre e da exclusão bilateral. Abra arquivos somente se confiar na origem.':
    [
      'The saved copy is outside the vault and bilateral deletion. Only open files from sources you trust.',
      '保存的副本不在保险库内，也不受双方删除机制影响。请仅打开来自可信来源的文件。',
    ],
  'A cópia salva fica fora do cofre e da limpeza pessoal. Abra arquivos somente se confiar na origem.':
    [
      'The saved copy is outside the vault and personal cleanup. Only open files from sources you trust.',
      '保存的副本不在保险库内，也不受个人清理机制影响。请仅打开来自可信来源的文件。',
    ],
  'A denúncia local é analisada pelos gestores. Sua identidade não aparece na resposta entregue a eles. Você pode acompanhar a análise abaixo.':
    [
      'Community managers review the local report. Your identity is not shown in the response delivered to them. You can track the review below.',
      '社区管理员会审核本地举报。发送给他们的响应不会显示你的身份。你可以在下方查看审核进度。',
    ],
  'a edição do perfil público em Perfil → Perfil público': [
    'public profile editing in Profile → Public profile',
    '“个人资料 → 公开个人资料”中的编辑',
  ],
  'a edição em Contatos': ['editing in Contacts', '“联系人”中的编辑'],
  'A entrada expirou. Conecte a wallet novamente.': [
    'The sign-in expired. Connect your wallet again.',
    '登录已过期。请重新连接钱包。',
  ],
  'a entrada na conta ou a edição do perfil privado em Perfil': [
    'account sign-in or private profile editing in Profile',
    '“个人资料”中的账户登录或私密个人资料编辑',
  ],
  'A escolha acompanha sua conta.': [
    'This choice follows your account.',
    '此选项将随账户同步。',
  ],
  'A fila deve ocupar até 512 MiB.': [
    'The queue must stay within 512 MiB.',
    '队列大小不得超过 512 MiB。',
  ],
  'A foto da comunidade ficou fora do público': [
    'The community photo was withheld from public view',
    '社区图片未公开展示',
  ],
  'A galeria está cheia. Exporte e apague a rodada antes de enviar mais imagens.':
    [
      'The gallery is full. Export and delete the round before uploading more images.',
      '图库已满。请先导出并删除本轮数据，再上传更多图片。',
    ],
  'A identidade criptográfica mudou. Compare com o contato por um canal independente antes de aceitar novas chaves.':
    [
      'The cryptographic identity changed. Compare it with your contact through an independent channel before accepting new keys.',
      '加密身份已更改。接受新密钥前，请通过独立渠道与联系人核对。',
    ],
  'A imagem salva diverge do envio. A fila foi preservada.': [
    'The saved image differs from the upload. The queue was preserved.',
    '保存的图片与上传内容不一致。队列已保留。',
  ],
  'A inicialização do microfone foi interrompida. Confira o trecho preservado.':
    [
      'Microphone initialization was interrupted. Check the preserved excerpt.',
      '麦克风初始化已中断。请检查保留的片段。',
    ],
  'A lista de aparelhos mudou. Confira sua escolha novamente.': [
    'The device list changed. Review your choice again.',
    '设备列表已更改。请重新确认所选设备。',
  ],
  'A lista de grupos mudou. Atualize.': [
    'The group list changed. Refresh it.',
    '群组列表已更改。请刷新。',
  ],
  'a operação do cofre em Perfil → Cofre e backup': [
    'the vault operation in Profile → Vault and backup',
    '“个人资料 → 保险库与备份”中的操作',
  ],
  'a operação em Atividade': ['the operation in Activity', '“活动”中的操作'],
  'a operação em Organizações e representantes': [
    'the operation in Organizations and representatives',
    '“组织与代表”中的操作',
  ],
  'a operação ou edição em Comunidades': [
    'the operation or editing in Communities',
    '“社区”中的操作或编辑',
  ],
  'A participação do grupo mudou. Atualize.': [
    'Group membership changed. Refresh it.',
    '群组成员已更改。请刷新。',
  ],
  'A postagem foi excluída. Seu conteúdo anterior não é conservado.': [
    'The post was deleted. Its previous content is not retained.',
    '帖子已删除。之前的内容不会保留。',
  ],
  'a publicação em Meu status': [
    'publishing in My status',
    '“我的状态”中的发布',
  ],
  'A recuperação já foi configurada.': [
    'Recovery is already configured.',
    '恢复功能已配置。',
  ],
  'A recuperação mudou durante a entrada. Inicie novamente.': [
    'Recovery changed during sign-in. Start again.',
    '登录期间恢复设置已更改。请重新开始。',
  ],
  'A rodada chegou ao limite. As imagens já enviadas continuam preservadas.': [
    'The round reached its limit. Images already uploaded are preserved.',
    '本轮已达到上限。已上传的图片会继续保留。',
  ],
  'A rodada expirou. As imagens temporárias foram descartadas.': [
    'The round expired. Temporary images were discarded.',
    '本轮已过期。临时图片已清除。',
  ],
  'A sessão está conectada. Abra sua conta para autorizar as chaves neste navegador.':
    [
      'The session is connected. Open your account to authorize the keys in this browser.',
      '会话已连接。请打开账户，以在此浏览器中授权密钥。',
    ],
  'A solicitação de conexão foi recusada na wallet.': [
    'The connection request was rejected in the wallet.',
    '钱包已拒绝连接请求。',
  ],
  'A transferência depende do aceite do destinatário. Depois do aceite, você passa a participante e perde a gestão.':
    [
      'The recipient must accept the transfer. After acceptance, you become a participant and lose management access.',
      '转让需要接收者接受。接受后，你将成为普通成员并失去管理权限。',
    ],
  'A versão anterior foi removida. Crie uma nova versão deliberadamente.': [
    'The previous version was removed. Create a new version explicitly.',
    '先前的版本已移除。如需新版本，请主动创建。',
  ],
  'A versão já foi confirmada. Nenhum dado aceito foi descartado.': [
    'The version was already confirmed. No accepted data was discarded.',
    '该版本已确认。没有丢弃任何已接受的数据。',
  ],
  'A wallet ainda não assinou.': [
    'The wallet has not signed yet.',
    '钱包尚未签名。',
  ],
  'A wallet alterou o pedido de login.': [
    'The wallet changed the sign-in request.',
    '钱包更改了登录请求。',
  ],
  'A wallet apresentou uma conta Solana com endereço ou chave pública inválidos.':
    [
      'The wallet returned a Solana account with an invalid address or public key.',
      '钱包返回的 Solana 账户地址或公钥无效。',
    ],
  'A wallet gerou assinaturas diferentes. Use outro aparelho autorizado por QR; esta tentativa não configurou recuperação.':
    [
      'The wallet produced different signatures. Use another device authorized by QR; recovery was not configured in this attempt.',
      '钱包生成的签名不一致。请使用另一台通过二维码授权的设备；本次尝试未配置恢复功能。',
    ],
  'A wallet não autorizou a conexão desta página.': [
    'The wallet did not authorize this page to connect.',
    '钱包未授权此页面连接。',
  ],
  'A wallet não concluiu a assinatura. Tente novamente.': [
    'The wallet did not complete signing. Try again.',
    '钱包未完成签名。请重试。',
  ],
  'A wallet não concluiu a conexão Solana.': [
    'The wallet did not complete the Solana connection.',
    '钱包未完成 Solana 连接。',
  ],
  'A wallet não concluiu em dois minutos. Recarregue antes de tentar novamente.':
    [
      'The wallet did not finish within two minutes. Reload before trying again.',
      '钱包未在两分钟内完成。请刷新后重试。',
    ],
  'A wallet não concluiu o pedido. Feche ou recuse a solicitação na wallet antes de tentar novamente.':
    [
      'The wallet did not complete the request. Close or reject the request in your wallet before trying again.',
      '钱包未完成请求。请先在钱包中关闭或拒绝该请求，再重试。',
    ],
  'A wallet recusou o método de conexão Solana.': [
    'The wallet rejected the Solana connection method.',
    '钱包拒绝了 Solana 连接方式。',
  ],
  'A wallet recusou os parâmetros da conexão Solana.': [
    'The wallet rejected the Solana connection parameters.',
    '钱包拒绝了 Solana 连接参数。',
  ],
  'Abertura de conta': ['Account opening', '打开账户'],
  'Abra o grupo conectado antes de alterar a foto.': [
    'Open the connected group before changing its photo.',
    '请先打开已连接的群组，再更换图片。',
  ],
  'Abra os contatos e sincronize para conversar.': [
    'Open and sync contacts to start chatting.',
    '请打开并同步联系人后开始聊天。',
  ],
  'Abra sua conta para alterar a privacidade.': [
    'Open your account to change privacy settings.',
    '请打开账户以更改隐私设置。',
  ],
  'Abra sua conta para confirmar o perfil.': [
    'Open your account to confirm the profile.',
    '请打开账户以确认个人资料。',
  ],
  'Abra um grupo conectado primeiro.': [
    'Open a connected group first.',
    '请先打开已连接的群组。',
  ],
  'Abra um grupo para conversar.': [
    'Open a group to chat.',
    '打开群组即可聊天。',
  ],
  'Abra um grupo primeiro.': ['Open a group first.', '请先打开群组。'],
  'Abra uma foto primeiro.': ['Open a photo first.', '请先打开图片。'],
  'Abra/sincronize a agenda e resolva o rascunho antes de trocar o convite.': [
    'Open/sync contacts and resolve your draft before replacing the invitation.',
    '请先打开并同步联系人，处理草稿后再更换邀请。',
  ],
  'Abrindo {0}… Se o app não abrir, toque em Abrir {1}. Conecte e assine; depois volte aqui para confirmar o endereço.':
    [
      'Opening {0}… If the app does not open, tap Open {1}. Connect and sign, then return here to confirm the address.',
      '正在打开 {0}… 如果应用未打开，请点击“打开 {1}”。连接并签名后，返回此处确认地址。',
    ],
  'Abrindo conversa…': ['Opening conversation…', '正在打开对话…'],
  'Abrindo sua conta…': ['Opening your account…', '正在打开账户…'],
  'chat.encrypted-on-device': ['Encrypted on this device', '已在此设备上加密'],
  'conversation.mute': ['Mute alerts…', '静音提醒…'],
  'ranking.title': ['Communities', '社区'],
  'ranking.trending': ['Trending', '热门'],
  'ranking.largest': ['Largest', '最大'],
  'ranking.new': ['New', '最新'],
  'ranking.following': ['Following', '已关注'],
  'ranking.community': ['Community', '社区'],
  'ranking.window': ['Last 24 h', '最近 24 小时'],
  'ranking.full': ['See full ranking', '查看完整排行'],
  'ranking.collapse': ['Collapse ranking', '收起排行'],
  'ranking.expand': ['Expand ranking', '展开排行'],
  'ranking.followers {0}': ['{0} followers', '{0} 位关注者'],
  'ranking.active {0}': ['{0} active', '{0} 位活跃'],
  'ranking.active-new {0}': ['▲ +{0} active', '▲ +{0} 位活跃'],
  'ranking.growth-up {0}': ['▲ {0}% active', '▲ 活跃 {0}%'],
  'ranking.growth-down {0}': ['▼ {0}% active', '▼ 活跃 {0}%'],
  'ranking.active-label': ['active', '活跃'],
  'feed.refresh': ['Refresh', '刷新'],
  'feed.refresh-label': [
    'Back to the top and load new posts',
    '回到顶部并加载新帖子',
  ],
  'feed.posted': ['posted', '发布了'],
  'feed.posted-label': [
    'New posts: back to the top and load them',
    '有新帖子：回到顶部并加载',
  ],
  'profile.bell-on {0}': ['Notifications on for @{0}', '已开启 @{0} 的通知'],
  'profile.bell-off {0}': ['Notifications off for @{0}', '已关闭 @{0} 的通知'],
  'upload.sending {0}': ['Sending: {0}%', '正在发送：{0}%'],
  'upload.percent {0}': ['{0}%', '{0}%'],
  'upload.processing': ['Processing…', '处理中…'],
  'upload.sending-file': ['Sending file…', '正在发送文件…'],
  'attachment.card-detail {0}': [
    '{0} MB · original, may keep GPS/EXIF',
    '{0} MB · 原始文件，可能保留 GPS/EXIF',
  ],
  'attachment.card-metadata': [
    'The original is sent as is and may keep photo metadata such as GPS/EXIF.',
    '原始文件按原样发送，可能保留 GPS/EXIF 等照片元数据。',
  ],
  'message.sending': ['Sending…', '正在发送…'],
  'crop.title': ['Edit media', '编辑图片'],
  'crop.stage': [
    'Drag to move the picture; use + and - to zoom',
    '拖动以移动图片；使用 + 和 - 缩放',
  ],
  'crop.zoom': ['Zoom', '缩放'],
  'crop.zoom-in': ['Zoom in', '放大'],
  'crop.zoom-out': ['Zoom out', '缩小'],
  'crop.apply': ['Apply', '应用'],
  'crop.cancel': ['Cancel', '取消'],
  'crop.failed': [
    'Could not frame the picture. Try another one.',
    '无法裁剪图片。请换一张试试。',
  ],
  'ranking.empty': ['No communities here yet.', '这里还没有社区。'],
  'ranking.sign-in': [
    'Sign in to see the communities you follow.',
    '登录后即可查看你关注的社区。',
  ],
  'ranking.unavailable': [
    'Ranking unavailable right now. Trying again…',
    '排行暂时不可用，正在重试…',
  ],
  'right-column.label': ['Conversation or communities', '对话或社区'],
  'right-column.chat': ['Chat', '聊天'],
  'right-column.communities': ['Communities', '社区'],
  'chat.attach-up-to-3mb': [
    'Attach photo or file · up to 3 MB',
    '附加图片或文件 · 最大 3 MB',
  ],
  'chat.attach-up-to-10mb': [
    'Attach photo or file · up to 10 MB',
    '附加图片或文件 · 最大 10 MB',
  ],
  'video.fullscreen': ['Full screen', '全屏'],
  'conversation.mute-1h': ['Mute for 1 hour', '静音 1 小时'],
  'conversation.mute-8h': ['Mute for 8 hours', '静音 8 小时'],
  'conversation.mute-24h': ['Mute for 24 hours', '静音 24 小时'],
  'conversation.mute-7d': ['Mute for 7 days', '静音 7 天'],
  'conversation.mute-forever': [
    'Mute until I turn alerts back on',
    '静音直到我重新开启',
  ],
  'conversation.resume-alerts': ['Resume alerts', '恢复提醒'],
  'conversation.alerts-saved': ['Alert setting saved.', '提醒设置已保存。'],
  'settings.appearance-language': ['Appearance and language', '外观与语言'],
  'settings.appearance-language.detail': [
    'Navy, Black or White theme and the app language',
    '藏蓝、黑色或白色主题，以及应用语言',
  ],
  'representatives.new-organization': ['New organization', '新建组织'],
  'community.create-menu': ['Create', '创建'],
  'community.create.images': ['Community banner and photo', '社区横幅和头像'],
  'community.create.add-banner': ['Add banner', '添加横幅'],
  'community.create.add-photo': ['Add photo', '添加头像'],
  'community.create.images-hint': [
    'Optional. The banner and photo are reviewed by the app once the community is created.',
    '可选。社区创建后，横幅和头像会经过应用审核。',
  ],
  'community.create.images-failed': [
    'The community was created, but the images were not saved. Fix them and press Create community again.',
    '社区已创建，但图片未保存。请修改后再次点击“创建社区”。',
  ],
  'dm.support-never-asks-seed': [
    'Support never asks for your seed phrase',
    '官方支持绝不会索要你的助记词',
  ],
  Abrir: ['Open', '打开'],
  'Abrir a discussão': ['Open the discussion', '打开讨论'],
  'Abrir comunidade': ['Open community', '打开社区'],
  'Abrir conta': ['Open account', '打开账户'],
  'Abrir contato': ['Open contact', '打开联系人'],
  'Abrir conversa': ['Open conversation', '打开对话'],
  'Abrir discussão': ['Open discussion', '打开讨论'],
  'Abrir foto': ['Open photo', '打开图片'],
  'Abrir meu perfil público': [
    'Open my public profile',
    '打开我的公开个人资料',
  ],
  'Abrir no app': ['Open in app', '在应用中打开'],
  'Abrir perfil': ['Open profile', '打开个人资料'],
  'Abrir perfil de @{0}': ["Open @{0}'s profile", '打开 @{0} 的个人资料'],
  'Abrir Phantom': ['Open Phantom', '打开 Phantom'],
  'Abrir postagem e {0} respostas diretas': [
    'Open post and {0} direct replies',
    '打开帖子及 {0} 条直接回复',
  ],
  'Abrir resposta e sua árvore': [
    'Open reply and its thread',
    '打开回复及其讨论串',
  ],
  'Abrir vídeo no YouTube': ['Open video on YouTube', '在 YouTube 上打开视频'],
  'Ação indisponível.': ['Action unavailable.', '操作不可用。'],
  'Aceita · entrega por aparelho pendente': [
    'Accepted · device delivery pending',
    '已接受 · 等待送达设备',
  ],
  'Aceita pelo servidor; recebimento do destinatário ainda não confirmado': [
    'Accepted by the server; recipient receipt is not yet confirmed',
    '服务器已接受；尚未确认接收者收悉',
  ],
  Aceitar: ['Accept', '接受'],
  'Aceitar propriedade': ['Accept ownership', '接受所有权'],
  'Aceitar representação e assinar': [
    'Accept representation and sign',
    '接受代表授权并签名',
  ],
  'Aceite não concluído: {0}': [
    'Acceptance not completed: {0}',
    '接受未完成：{0}',
  ],
  'Aceite salvo. Você pode apresentar esta autorização nas conversas.': [
    'Acceptance saved. You can present this authorization in conversations.',
    '接受记录已保存。你可以在对话中出示此授权。',
  ],
  'Acesso ausente. Reabra o endereço privado fornecido.': [
    'Access missing. Reopen the private address provided.',
    '缺少访问权限。请重新打开提供的私密地址。',
  ],
  'Acesso inválido. Reabra o endereço privado fornecido.': [
    'Invalid access. Reopen the private address provided.',
    '访问无效。请重新打开提供的私密地址。',
  ],
  'Acessos de comunidades': ['Community access', '社区访问'],
  Adicionar: ['Add', '添加'],
  'Adicionar aos favoritos': ['Add to favorites', '添加到收藏'],
  'Adicionar contato': ['Add contact', '添加联系人'],
  'Adicionar participantes': ['Add participants', '添加成员'],
  'Adicione um contato ou entre em um grupo para começar.': [
    'Add a contact or join a group to get started.',
    '添加联系人或加入群组即可开始。',
  ],
  Administrador: ['Administrator', '管理员'],
  'Administrar {0}': ['Manage {0}', '管理 {0}'],
  'Advertência registrada: seu vídeo foi removido do público por conteúdo impróprio.':
    [
      'Warning recorded: your video was removed from public view for inappropriate content.',
      '已记录警告：你的视频因不当内容被从公开区域移除。',
    ],
  Agenda: ['Contacts', '联系人'],
  'Aguardando aceite': ['Awaiting acceptance', '等待接受'],
  'Aguardando análise': ['Awaiting analysis', '等待分析'],
  'Aguardando análise. O arquivo continua restrito.': [
    'Awaiting analysis. The file remains restricted.',
    '等待分析。文件仍受限制。',
  ],
  'Aguardando assinatura na wallet. Volte ao navegador que abriu o pedido.': [
    'Waiting for a wallet signature. Return to the browser that opened the request.',
    '等待钱包签名。请返回打开请求的浏览器。',
  ],
  'Aguardando autorização automática. Mantenha aberto o aparelho que gerou o código.':
    [
      'Waiting for automatic authorization. Keep the device that generated the code open.',
      '等待自动授权。请保持生成代码的设备处于打开状态。',
    ],
  'Aguarde a abertura do perfil antes de salvar o backup completo.': [
    'Wait for the profile to open before saving the full backup.',
    '请等待个人资料打开后，再保存完整备份。',
  ],
  'Aguarde a atualização atual.': [
    'Wait for the current update.',
    '请等待当前更新完成。',
  ],
  'Aguarde a atualização das conversas e tente novamente.': [
    'Wait for conversations to update, then try again.',
    '请等待对话更新后重试。',
  ],
  'Aguarde a confirmação da identidade da chamada.': [
    'Wait for the call identity to be confirmed.',
    '请等待通话身份确认。',
  ],
  'Aguarde a entrada atual terminar e tente novamente.': [
    'Wait for the current sign-in to finish, then try again.',
    '请等待当前登录完成后重试。',
  ],
  'Aguarde a instalação do aplicativo offline e tente novamente.': [
    'Wait for the offline app installation to finish, then try again.',
    '请等待离线应用安装完成后重试。',
  ],
  'Aguarde…': ['Please wait…', '请稍候…'],
  'Ainda não há respostas.': ['No replies yet.', '暂无回复。'],
  'Ainda não verificada.': ['Not verified yet.', '尚未验证。'],
  'Ajustar à tela': ['Fit to screen', '适应屏幕'],
  'Alertas silenciados, mas o arquivamento não foi salvo. Tente novamente.': [
    'Alerts were muted, but archiving was not saved. Try again.',
    '通知已静音，但归档未保存。请重试。',
  ],
  'Alguns envios ainda estão pendentes. A retomada é automática.': [
    'Some sends are still pending. They will resume automatically.',
    '部分发送仍待完成，将自动恢复。',
  ],
  'Alteração divergente da mensagem original.': [
    'Change differs from the original message.',
    '更改与原始消息不一致。',
  ],
  'Alteração histórica divergente.': [
    'Historical change does not match.',
    '历史更改不匹配。',
  ],
  'Alteração salva.': ['Change saved.', '更改已保存。'],
  'Alterações confirmadas.': ['Changes confirmed.', '更改已确认。'],
  'Alterações locais parcialmente carregadas; continue abrindo a cópia local.':
    [
      'Local changes are partially loaded; keep opening the local copy.',
      '本地更改已部分加载；请继续打开本地副本。',
    ],
  'Alterar foto de perfil': ['Change profile photo', '更换个人资料图片'],
  'Alterar foto do grupo': ['Change group photo', '更换群组图片'],
  'Amostra de áudio inválida.': ['Invalid audio sample.', '音频采样无效。'],
  Ampliar: ['Zoom in', '放大'],
  'Ampliar imagem': ['Zoom in on image', '放大图片'],
  'Ampliar imagem {0}': ['Zoom in on image {0}', '放大图片 {0}'],
  'Analisando e guardando este caso na rodada temporária…': [
    'Analyzing and saving this case in the temporary round…',
    '正在分析此案例并保存到临时评估轮次…',
  ],
  'Análise concluída: conteúdo permitido.': [
    'Analysis completed: content allowed.',
    '分析已完成：内容获准。',
  ],
  'Análise do conteúdo': ['Content analysis', '内容分析'],
  'Análise em andamento. O arquivo continua restrito.': [
    'Analysis in progress. The file remains restricted.',
    '正在分析。文件仍受限制。',
  ],
  'Análise encerrada por troca, remoção ou atualização da regra.': [
    'Analysis ended due to replacement, removal or a rule update.',
    '分析因替换、移除或规则更新而结束。',
  ],
  'Análise incerta. O arquivo continua restrito e pode ser contestado.': [
    'Analysis uncertain. The file remains restricted and can be appealed.',
    '分析结果不确定。文件仍受限制，可提出申诉。',
  ],
  'Análise indisponível.': ['Analysis unavailable.', '分析不可用。'],
  'Análise: {0}': ['Analysis: {0}', '分析：{0}'],
  'Anexar fotos, GIFs ou vídeo': [
    'Attach photos, GIFs or video',
    '附加图片、GIF 或视频',
  ],
  'Anexo ainda não foi baixado neste aparelho. Conecte e toque para baixar.': [
    'This attachment has not been downloaded on this device. Connect and tap to download.',
    '此设备尚未下载附件。请联网并点击下载。',
  ],
  'Anexo de grupo divergente.': [
    'Group attachment does not match.',
    '群组附件不匹配。',
  ],
  'Anexo incompleto ou adulterado.': [
    'Attachment incomplete or tampered with.',
    '附件不完整或遭到篡改。',
  ],
  'Anexos divergentes da mensagem autenticada.': [
    'Attachments differ from the authenticated message.',
    '附件与已验证的消息不一致。',
  ],
  'Anexos em processamento. Aguarde.': [
    'Processing attachments. Please wait.',
    '正在处理附件。请稍候。',
  ],
  'Animais e natureza': ['Animals and nature', '动物与自然'],
  'Anotação divergente do caso.': [
    'Annotation does not match the case.',
    '标注与案例不匹配。',
  ],
  Anteriores: ['Previous', '上一页'],
  'Ao aceitar, você assume a propriedade e a gestão desta comunidade. Confira as regras e o proprietário atual.':
    [
      'By accepting, you take ownership and management of this community. Check its rules and current owner.',
      '接受后，你将获得此社区的所有权与管理权。请先核对规则和当前所有者。',
    ],
  'Ao buscar ou carregar GIFs, seu aparelho se conecta ao KLIPY, que recebe seu IP e pode coletar suas buscas, GIFs acessados e dados do navegador. O app não envia sua wallet, chaves ou histórico de conversas ao KLIPY.':
    [
      'When searching for or loading GIFs, your device connects to KLIPY, which receives your IP and may collect your searches, accessed GIFs and browser data. The app does not send your wallet, keys or conversation history to KLIPY.',
      '搜索或加载 GIF 时，设备会连接到 KLIPY。该服务会接收你的 IP，并可能收集搜索内容、访问的 GIF 及浏览器数据。应用不会向 KLIPY 发送钱包信息、密钥或对话历史。',
    ],
  'Apagar envio': ['Delete send', '删除发送项'],
  'Apagar para ambos': ['Delete for both', '为双方删除'],
  'Apagar todas as imagens e resultados desta rodada temporária? Arquivos já baixados permanecem no seu dispositivo.':
    [
      'Delete all images and results from this temporary round? Files already downloaded remain on your device.',
      '删除本次临时评估的所有图片和结果？已下载的文件仍会保留在设备上。',
    ],
  'Aparelho de DMs': ['DM device', '私信设备'],
  'Aparelho do contato não autorizado.': [
    "The contact's device is not authorized.",
    '联系人的设备未获授权。',
  ],
  'Aparelho do contato revogado.': [
    "The contact's device was revoked.",
    '联系人的设备授权已撤销。',
  ],
  'Aparelho recuperado': ['Recovered device', '已恢复的设备'],
  'Aparelho revogado ou chave não autorizada.': [
    'Device revoked or key not authorized.',
    '设备授权已撤销或密钥未获授权。',
  ],
  'Aparelho revogado.': ['Device revoked.', '设备授权已撤销。'],
  'Aparelho vinculado. Sua conta está pronta.': [
    'Device linked. Your account is ready.',
    '设备已关联。账户已就绪。',
  ],
  'Aparelhos da chamada inválidos.': [
    'Invalid call devices.',
    '通话设备无效。',
  ],
  'Aparelhos de DMs inválidos.': ['Invalid DM devices.', '私信设备无效。'],
  'Aparelhos do contato mudaram.': [
    "The contact's devices changed.",
    '联系人的设备已更改。',
  ],
  'Aparelhos mudaram durante a leitura. Tente novamente.': [
    'Devices changed while reading. Try again.',
    '读取期间设备已更改。请重试。',
  ],
  Aparência: ['Appearance', '外观'],
  'Aplicar sanção': ['Apply sanction', '施加处罚'],
  'Apresentar autorização': ['Present authorization', '出示授权'],
  'Apresente uma autorização aceita ou envie um convite de representação.': [
    'Present an accepted authorization or send a representation invitation.',
    '出示已接受的授权，或发送代表邀请。',
  ],
  'Armazenamento de dispositivos indisponível. Nenhuma autorização local foi confirmada.':
    [
      'Device storage unavailable. No local authorization was confirmed.',
      '设备存储不可用。未确认任何本地授权。',
    ],
  'Armazenamento indisponível ou pacote inválido. Use um perfil de navegador de teste limpo.':
    [
      'Storage unavailable or package invalid. Use a clean test browser profile.',
      '存储不可用或数据包无效。请使用全新的测试浏览器配置。',
    ],
  'Armazenamento local indisponível.': [
    'Local storage unavailable.',
    '本地存储不可用。',
  ],
  Arquivada: ['Archived', '已归档'],
  Arquivar: ['Archive', '归档'],
  'Arquivar comunidade': ['Archive community', '归档社区'],
  'Arquivar silencia alertas. Desarquivar não retoma alertas automaticamente.':
    [
      'Archiving mutes alerts. Unarchiving does not automatically restore alerts.',
      '归档会静音通知。取消归档不会自动恢复通知。',
    ],
  'Arquivo ainda em preparação.': [
    'File still being prepared.',
    '文件仍在准备中。',
  ],
  'Arquivo de backup não suportado.': [
    'Unsupported backup file.',
    '不支持此备份文件。',
  ],
  'Arquivo deve ter até 3 MB.': [
    'The file must be no larger than 3 MB.',
    '文件大小不得超过 3 MB。',
  ],
  'Arquivo deve ter até 10 MB.': [
    'The file must be no larger than 10 MB.',
    '文件大小不得超过 10 MB。',
  ],
  'Arquivo do perfil ou da comunidade identificado pelo registro abaixo.': [
    'Profile or community file identified by the record below.',
    '下方记录所标识的个人资料或社区文件。',
  ],
  'Arquivo excede {0} MB.': ['File exceeds {0} MB.', '文件超过 {0} MB。'],
  'Arquivo importado: {0}': ['Imported file: {0}', '已导入文件：{0}'],
  'Arquivo importado. O pacote ativo agora é {0}. Selecione a conta de origem e clique em Testar este pacote.':
    [
      'File imported. The active package is now {0}. Select the source account and click Test this package.',
      '文件已导入。当前数据包为 {0}。请选择来源账户，然后点击“测试此数据包”。',
    ],
  'Arquivo íntegro e completo. Histórico importado para Conversas neste aparelho.':
    [
      'File intact and complete. History imported into Conversations on this device.',
      '文件完整且无损。历史已导入此设备的“对话”。',
    ],
  'Arquivo íntegro, com conteúdo incompleto. Os itens presentes foram importados; o reset permanece bloqueado.':
    [
      'File intact, with incomplete content. Available items were imported; reset remains blocked.',
      '文件无损，但内容不完整。已有项目已导入；重置仍被阻止。',
    ],
  'Arquivo inválido.': ['Invalid file.', '文件无效。'],
  'Arquivo não concluído.': ['File not completed.', '文件未完成。'],
  'Arquivo recuperável ausente.': [
    'Recoverable file missing.',
    '缺少可恢复文件。',
  ],
  'Arquivo removido da fila; nenhuma marcação foi salva para ele.': [
    'File removed from the queue; no annotation was saved for it.',
    '文件已从队列中移除；未保存其标注。',
  ],
  'Arquivo vazio ou acima do limite de 3 MB. Escolha outro arquivo.': [
    'File empty or larger than 3 MB. Choose another file.',
    '文件为空或超过 3 MB。请选择其他文件。',
  ],
  'Arquivo vazio ou acima do limite de 10 MB. Escolha outro arquivo.': [
    'File empty or larger than 10 MB. Choose another file.',
    '文件为空或超过 10 MB。请选择其他文件。',
  ],
  'Arquivo: {0}': ['File: {0}', '文件：{0}'],
  'Arquivos divergem para o mesmo registro histórico.': [
    'Files differ for the same historical record.',
    '同一历史记录的文件不一致。',
  ],
  'As alterações ficam como prévia neste aparelho até confirmar. Imagens confirmadas passam pela análise do app.':
    [
      "Changes remain a preview on this device until confirmed. Confirmed images go through the app's analysis.",
      '确认前，更改仅作为此设备上的预览。确认后的图片会经过应用分析。',
    ],
  'As duas assinaturas são válidas, mas diferentes. Esta tentativa não permite recuperação estável.':
    [
      'Both signatures are valid but different. This attempt cannot provide stable recovery.',
      '两次签名均有效，但不一致。本次尝试无法提供稳定恢复。',
    ],
  'Assinar autorização': ['Sign authorization', '签署授权'],
  'Assinatura confirmada. Feche a {0} e volte ao navegador onde iniciou o login para confirmar o endereço.':
    [
      'Signature confirmed. Close {0} and return to the browser where you started signing in to confirm the address.',
      '签名已确认。请关闭 {0}，返回发起登录的浏览器以确认地址。',
    ],
  'Assinatura de recuperação inválida.': [
    'Invalid recovery signature.',
    '恢复签名无效。',
  ],
  'Assinatura de recuperação rejeitada: wallet, mensagem ou integridade inválida.':
    [
      'Recovery signature rejected: invalid wallet, message or integrity.',
      '恢复签名被拒绝：钱包、消息或完整性无效。',
    ],
  'Assinatura de teste confirmada. A Phantom devolveu a resposta a este navegador. Nenhuma conta do 0xDMme foi conectada. Se esta for outra aba, volte à aba original para comparar o retorno.':
    [
      'Test signature confirmed. Phantom returned the response to this browser. No 0xDMme account was connected. If this is another tab, return to the original tab to compare the result.',
      '测试签名已确认。Phantom 已将响应返回此浏览器。未连接任何 0xDMme 账户。若这是另一个标签页，请返回原标签页比较结果。',
    ],
  'Assinatura do ensaio inválida.': [
    'Invalid test signature.',
    '测试签名无效。',
  ],
  'Assinatura EVM inválida.': ['Invalid EVM signature.', 'EVM 签名无效。'],
  'Assinatura inválida.': ['Invalid signature.', '签名无效。'],
  'Assinatura não concluída na wallet. Confira a conta e tente novamente.': [
    'Signing was not completed in the wallet. Check the account and try again.',
    '钱包未完成签名。请检查账户后重试。',
  ],
  'Assinatura Solana inválida.': [
    'Invalid Solana signature.',
    'Solana 签名无效。',
  ],
  'Assinaturas de recuperação ausentes.': [
    'Recovery signatures missing.',
    '缺少恢复签名。',
  ],
  'Assine na wallet e volte a este navegador. A conclusão será automática.': [
    'Sign in your wallet and return to this browser. Completion is automatic.',
    '请在钱包中签名并返回此浏览器。流程会自动完成。',
  ],
  'Até {0}': ['Until {0}', '截至 {0}'],
  'Até 4 fotos, 3 GIFs ou 1 vídeo': [
    'Up to 4 photos, 3 GIFs or 1 video',
    '最多 4 张图片、3 个 GIF 或 1 个视频',
  ],
  Atender: ['Answer', '接听'],
  'Ativar notificações de posts e respostas': [
    'Enable post and reply notifications',
    '启用帖子与回复通知',
  ],
  'Ativar recebimento de chamadas': ['Enable incoming calls', '启用来电'],
  'Ativar sons': ['Enable sounds', '启用声音'],
  Atividade: ['Activity', '活动'],
  'Atividade atualizada.': ['Activity updated.', '活动已更新。'],
  'Atividade do perfil público': [
    'Public profile activity',
    '公开个人资料动态',
  ],
  Atividades: ['Activity', '活动'],
  'Atribuição manual, sem poderes de gestão. Até 20 badges e três por pessoa.':
    [
      'Manually assigned, without management powers. Up to 20 badges and three per person.',
      '手动分配，不授予管理权限。最多 20 个徽章，每人最多 3 个。',
    ],
  'Atribuir badge': ['Assign badge', '分配徽章'],
  'Atualização do grupo pendente': ['Group update pending', '群组更新待完成'],
  'Atualização em andamento. Mantenha o app aberto e conectado.': [
    'Update in progress. Keep the app open and connected.',
    '正在更新。请保持应用打开并联网。',
  ],
  'Atualização imediata disponível após autorizar o aparelho.': [
    'Live updates available after authorizing the device.',
    '设备获授权后即可接收实时更新。',
  ],
  'Atualização não concluída. Reabra a página quando for conveniente.': [
    'Update not completed. Reopen the page when convenient.',
    '更新未完成。请在方便时重新打开页面。',
  ],
  'Atualização offline indisponível. A versão instalada permanece disponível.':
    [
      'Offline update unavailable. The installed version remains available.',
      '离线更新不可用。已安装的版本仍可使用。',
    ],
  Atualizada: ['Updated', '已更新'],
  'Atualizando contatos…': ['Updating contacts…', '正在更新联系人…'],
  Atualizar: ['Refresh', '刷新'],
  'Atualize o grupo antes de alterar a foto.': [
    'Refresh the group before changing its photo.',
    '请刷新群组后再更换图片。',
  ],
  'Audiência da publicação divergiu.': [
    'Publication audience does not match.',
    '发布对象不匹配。',
  ],
  'Audiência inválida.': ['Invalid audience.', '受众无效。'],
  'Audiência ou recuperação incompleta.': [
    'Audience or recovery incomplete.',
    '受众或恢复信息不完整。',
  ],
  'Áudio encerrado neste aparelho. Sem confirmação do servidor; o outro lado encerra em até 20 segundos.':
    [
      'Audio ended on this device. The server has not confirmed; the other side ends within 20 seconds.',
      '此设备上的音频已结束。服务器尚未确认；对方会在 20 秒内结束。',
    ],
  'Autor indisponível': ['Author unavailable', '作者不可用'],
  'Autoridade da recuperação ausente.': [
    'Recovery authority missing.',
    '缺少恢复授权信息。',
  ],
  'Autoridade da sessão de grupo ausente.': [
    'Group session authority missing.',
    '缺少群组会话授权信息。',
  ],
  'Autoridade de grupo incompleta.': [
    'Group authority incomplete.',
    '群组授权信息不完整。',
  ],
  'Autoridade de outra conta ou aparelho.': [
    'Authority belongs to another account or device.',
    '授权属于另一个账户或设备。',
  ],
  'Autoridade do contato não conferida.': [
    'Contact authority has not been verified.',
    '联系人授权尚未核验。',
  ],
  'Autoridade histórica da DM ausente.': [
    'Historical DM authority missing.',
    '缺少历史私信授权信息。',
  ],
  'Autoridade histórica da recuperação ausente.': [
    'Historical recovery authority missing.',
    '缺少历史恢复授权信息。',
  ],
  'Autorização atual não confirmada: {0}': [
    'Current authorization not confirmed: {0}',
    '当前授权未确认：{0}',
  ],
  'Autorização criada. Abra a conversa do representante para enviá-la.': [
    "Authorization created. Open the representative's conversation to send it.",
    '授权已创建。请打开与代表的对话以发送。',
  ],
  'Autorização da conta alterada.': [
    'Account authorization changed.',
    '账户授权已更改。',
  ],
  'Autorização revogada.': ['Authorization revoked.', '授权已撤销。'],
  'Autorizar representante de {0}. A assinatura não concede cargos de grupo nem movimenta fundos.':
    [
      'Authorize a representative for {0}. The signature does not grant group roles or move funds.',
      '为 {0} 授权代表。签名不会授予群组职务或转移资金。',
    ],
  'Autorize o microfone. A gravação começa após a permissão.': [
    'Allow microphone access. Recording starts after permission is granted.',
    '请允许使用麦克风。授权后开始录音。',
  ],
  'Autorize ou recupere este aparelho para abrir o cofre.': [
    'Authorize or recover this device to open the vault.',
    '请授权或恢复此设备以打开保险库。',
  ],
  'Aviso de atualização excedido.': [
    'Update notice exceeds the limit.',
    '更新通知超过限制。',
  ],
  'Aviso de atualização incompleto.': [
    'Update notice incomplete.',
    '更新通知不完整。',
  ],
  'Aviso de atualização inválido.': [
    'Invalid update notice.',
    '更新通知无效。',
  ],
  'Aviso de limpeza inválido.': ['Invalid cleanup notice.', '清理通知无效。'],
  'Aviso de privacidade indisponível.': [
    'Privacy notice unavailable.',
    '隐私提示不可用。',
  ],
  'Aviso sobre conteúdo público': ['Public content notice', '公开内容提示'],
  'Avisos de análise inválidos.': [
    'Invalid analysis notices.',
    '分析通知无效。',
  ],
  'Avisos e GIFs ligados, presença escondida e confirmação de leitura.': [
    'Alerts and GIFs enabled, presence hidden and read receipts enabled.',
    '启用通知、GIF 和已读回执，隐藏在线状态。',
  ],
  Azul: ['Blue', '蓝色'],
  'Backup de outra conta ou cabeçalho inválido.': [
    'Backup belongs to another account or has an invalid header.',
    '备份属于另一个账户，或文件头无效。',
  ],
  'Backup encerrado.': ['Backup ended.', '备份已结束。'],
  'Backup excede o limite de 4 GiB por arquivo.': [
    'Backup exceeds the 4 GiB per-file limit.',
    '备份超过每个文件 4 GiB 的上限。',
  ],
  'Backup fechado.': ['Backup closed.', '备份已关闭。'],
  'Backup incompleto ou reordenado.': [
    'Backup incomplete or reordered.',
    '备份不完整或顺序被更改。',
  ],
  'Backup incompleto: {0} itens indisponíveis. O reset permanece bloqueado; tente salvar novamente.':
    [
      'Backup incomplete: {0} unavailable items. Reset remains blocked; try saving again.',
      '备份不完整：{0} 项不可用。重置仍被阻止；请重新尝试保存。',
    ],
  'Backup incompleto. O reset exige todas as conversas e mídias.': [
    'Backup incomplete. Reset requires all conversations and media.',
    '备份不完整。重置需要所有对话和媒体。',
  ],
  'Backup já encerrado.': ['Backup already ended.', '备份已结束。'],
  'Backup preparado. Guarde o arquivo e use “Validar arquivo” para conferir a cópia salva.':
    [
      'Backup prepared. Keep the file and use “Validate file” to check the saved copy.',
      '备份已准备好。请保留文件，并使用“验证文件”检查保存的副本。',
    ],
  'Backup truncado.': ['Backup truncated.', '备份被截断。'],
  'Backup vazio ou acima de 1 GiB.': [
    'Backup empty or larger than 1 GiB.',
    '备份为空或超过 1 GiB。',
  ],
  'Badge atualizado.': ['Badge updated.', '徽章已更新。'],
  'Badges personalizados': ['Custom badges', '自定义徽章'],
  'Baixar arquivo original': ['Download original file', '下载原始文件'],
  Bandeiras: ['Flags', '旗帜'],
  'Banimento reversível': ['Reversible ban', '可撤销封禁'],
  'Banner da comunidade': ['Community banner', '社区横幅'],
  'Banner do perfil': ['Profile banner', '个人资料横幅'],
  'Bloco incompleto ou corrompido.': [
    'Block incomplete or corrupted.',
    '数据块不完整或损坏。',
  ],
  Bloqueada: ['Blocked', '已屏蔽'],
  Bloquear: ['Block', '屏蔽'],
  'Bloquear contato': ['Block contact', '屏蔽联系人'],
  'Bloquear usuário': ['Block user', '屏蔽用户'],
  Bloqueia: ['Block', '屏蔽'],
  'bloqueio {0}': ['block {0}', '拦截 {0}'],
  'Bloqueio removido. Uma nova solicitação e aprovação continuam necessárias.':
    [
      'Block removed. A new request and approval are still required.',
      '屏蔽已解除。仍需重新发送请求并获得批准。',
    ],
  Branco: ['White', '白色'],
  'Busca concluída nas cópias disponíveis neste aparelho.': [
    'Search completed in copies available on this device.',
    '已搜索此设备上的可用副本。',
  ],
  'Busca concluída. As mensagens recebidas estão abaixo.': [
    'Search completed. Received messages are below.',
    '搜索已完成。收到的消息列于下方。',
  ],
  'Busca de GIFs indisponível agora.': [
    'GIF search is currently unavailable.',
    'GIF 搜索暂时不可用。',
  ],
  'Busca de GIFs indisponível. Você pode anexar um arquivo GIF.': [
    'GIF search unavailable. You can attach a GIF file.',
    'GIF 搜索不可用。你可以附加 GIF 文件。',
  ],
  'Busca de outra conta.': [
    'Search belongs to another account.',
    '搜索属于另一个账户。',
  ],
  'Busca inválida.': ['Invalid search.', '搜索无效。'],
  'Buscando neste aparelho…': [
    'Searching on this device…',
    '正在此设备上搜索…',
  ],
  'Buscando…': ['Searching…', '正在搜索…'],
  'Buscar mensagens': ['Search messages', '搜索消息'],
  'Buscar perfil': ['Find profile', '查找个人资料'],
  'Busque e confira o perfil antes de continuar.': [
    'Find and check the profile before continuing.',
    '请查找并核对个人资料后继续。',
  ],
  'Busque entre 1 e 128 caracteres.': [
    'Enter between 1 and 128 characters.',
    '请输入 1–128 个字符。',
  ],
  'Cabeçalho inválido.': ['Invalid header.', '文件头无效。'],
  'Cache de outro grupo ou registro.': [
    'Cache belongs to another group or record.',
    '缓存属于另一个群组或记录。',
  ],
  'Cache ocupado por envios pendentes. Conclua ou cancele antes de baixar outros anexos.':
    [
      'Cache occupied by pending sends. Complete or cancel them before downloading other attachments.',
      '待发送内容占用了缓存。请完成或取消发送后，再下载其他附件。',
    ],
  'Caixa de chaves de DMs inválida.': [
    'Invalid DM key box.',
    '私信密钥容器无效。',
  ],
  'Caixa Olm inválida.': ['Invalid Olm box.', 'Olm 容器无效。'],
  'Câmera indisponível. Use HTTPS e permita a câmera, ou copie o código.': [
    'Camera unavailable. Use HTTPS and allow camera access, or copy the code.',
    '摄像头不可用。请使用 HTTPS 并允许摄像头权限，或复制代码。',
  ],
  'Caminho selecionado ausente.': ['Selected path missing.', '缺少所选路径。'],
  'Campos do ensaio inválidos.': ['Invalid test fields.', '测试字段无效。'],
  'Canal indisponível.': ['Channel unavailable.', '通道不可用。'],
  'Canal inválido.': ['Invalid channel.', '通道无效。'],
  Cancelar: ['Cancel', '取消'],
  'Cancelar chamada': ['Cancel call', '取消通话'],
  'Cancelar solicitação': ['Cancel request', '取消请求'],
  'Cancelar transferência': ['Cancel transfer', '取消转让'],
  'Cápsulas da publicação divergiram.': [
    'Publication capsules do not match.',
    '发布密钥封装不匹配。',
  ],
  'Carregando atividade…': ['Loading activity…', '正在加载活动…'],
  'Carregando GIFs…': ['Loading GIFs…', '正在加载 GIF…'],
  'Carregando imagem…': ['Loading image…', '正在加载图片…'],
  'Carregando mensagens pelo @…': [
    'Loading handle messages…',
    '正在加载用户名私信…',
  ],
  'Carregando opções…': ['Loading options…', '正在加载选项…'],
  'Carregando perfil público…': [
    'Loading public profile…',
    '正在加载公开个人资料…',
  ],
  'Carregando seguidores…': ['Loading followers…', '正在加载关注者…'],
  'Carregando sua análise…': [
    'Loading your analysis…',
    '正在加载你的分析结果…',
  ],
  'Carregando vídeo…': ['Loading video…', '正在加载视频…'],
  'Carregar badges': ['Load badges', '加载徽章'],
  'Carregar denúncias recebidas': ['Load received reports', '加载收到的举报'],
  'Carregar imagem': ['Load image', '加载图片'],
  'Carregar minhas denúncias': ['Load my reports', '加载我的举报'],
  'Carregar sanções': ['Load sanctions', '加载处罚'],
  'Carregue esta versão primeiro.': [
    'Load this version first.',
    '请先加载此版本。',
  ],
  'Cartão de autorização inválido.': [
    'Invalid authorization card.',
    '授权卡片无效。',
  ],
  'Cartão de perfil inválido.': ['Invalid profile card.', '个人资料卡片无效。'],
  'Cartão de perfil local divergente.': [
    'Local profile card does not match.',
    '本地个人资料卡片不匹配。',
  ],
  'Cartão enviado pelo chat criptografado.': [
    'Card sent through encrypted chat.',
    '卡片已通过加密聊天发送。',
  ],
  'Caso {0}': ['Case {0}', '案例 {0}'],
  'Caso {0} salvo com imagem, scores e sua referência.': [
    'Case {0} saved with image, scores and your reference.',
    '案例 {0} 已保存，包含图片、评分和你的参考标注。',
  ],
  'Caso inválido recebido da coleta.': [
    'Invalid case received from collection.',
    '从采集端收到的案例无效。',
  ],
  'Catálogo local de outra conta.': [
    'Local catalog belongs to another account.',
    '本地目录属于另一个账户。',
  ],
  'Categorias de configurações': ['Settings categories', '设置类别'],
  'Chamada cancelada.': ['Call cancelled.', '通话已取消。'],
  'Chamada conectada · voz criptografada.': [
    'Call connected · encrypted voice.',
    '通话已连接 · 加密语音。',
  ],
  'Chamada de voz': ['Voice call', '语音通话'],
  'Chamada de voz · {0}': ['Voice call · {0}', '语音通话 · {0}'],
  'Chamada de voz não atendida · {0}': [
    'Missed voice call · {0}',
    '未接语音通话 · {0}',
  ],
  'Chamada de voz recebida.': ['Incoming voice call.', '收到语音来电。'],
  'Chamada de voz recebida. Abra o app para atender.': [
    'Incoming voice call. Open the app to answer.',
    '收到语音来电。请打开应用接听。',
  ],
  'Chamada encerrada ao sair desta página.': [
    'Call ended when leaving this page.',
    '离开此页面后通话已结束。',
  ],
  'Chamada encerrada ou indisponível.': [
    'Call ended or unavailable.',
    '通话已结束或不可用。',
  ],
  'Chamada encerrada: autorização indisponível.': [
    'Call ended: authorization unavailable.',
    '通话已结束：授权不可用。',
  ],
  'Chamada encerrada: autorização mudou.': [
    'Call ended: authorization changed.',
    '通话已结束：授权已更改。',
  ],
  'Chamada encerrada: conexão com o servidor perdida.': [
    'Call ended: connection to server lost.',
    '通话已结束：与服务器的连接中断。',
  ],
  'Chamada encerrada.': ['Call ended.', '通话已结束。'],
  'Chamada recusada.': ['Call declined.', '通话已拒绝。'],
  'Chamada rejeitada: identidade ou negociação inválida.': [
    'Call rejected: invalid identity or negotiation.',
    '通话被拒绝：身份或协商无效。',
  ],
  'Chamadas aguardam a configuração do TURN próprio.': [
    "Calls are awaiting configuration of the app's own TURN server.",
    '通话功能等待应用自有 TURN 服务器完成配置。',
  ],
  'Chamadas disponíveis com o app aberto.': [
    'Calls available while the app is open.',
    '应用打开时可进行通话。',
  ],
  'Chamadas indisponíveis agora.': [
    'Calls currently unavailable.',
    '通话暂时不可用。',
  ],
  'Chamadas perdidas removidas da lista em todos os aparelhos.': [
    'Missed calls removed from the list on all devices.',
    '已从所有设备的列表中移除未接来电。',
  ],
  'Chamadas: entre e autorize este aparelho.': [
    'Calls: sign in and authorize this device.',
    '通话：请登录并授权此设备。',
  ],
  'Chamando…': ['Calling…', '正在呼叫…'],
  'Chave confirmada. Pronto para enviar e receber.': [
    'Key confirmed. Ready to send and receive.',
    '密钥已确认。可以发送和接收。',
  ],
  'Chave de aparelho revogado.': [
    'Key belongs to a revoked device.',
    '密钥属于已撤销授权的设备。',
  ],
  'Chave de armazenamento inválida.': [
    'Invalid storage key.',
    '存储密钥无效。',
  ],
  'Chave de backup inválida.': ['Invalid backup key.', '备份密钥无效。'],
  'Chave de criptografia ausente.': [
    'Encryption key missing.',
    '缺少加密密钥。',
  ],
  'Chave de destino ou pedido de recuperação alterado.': [
    'Destination key or recovery request changed.',
    '目标密钥或恢复请求已更改。',
  ],
  'Chave de origem de grupo divergente.': [
    'Group source key does not match.',
    '群组来源密钥不匹配。',
  ],
  'Chave de origem de status divergente.': [
    'Status source key does not match.',
    '状态来源密钥不匹配。',
  ],
  'Chave de origem não autorizada.': [
    'Source key not authorized.',
    '来源密钥未获授权。',
  ],
  'Chave de recuperação deve conter 256 bits aleatórios.': [
    'The recovery key must contain 256 random bits.',
    '恢复密钥必须包含 256 位随机比特。',
  ],
  'Chave de recuperação inválida.': ['Invalid recovery key.', '恢复密钥无效。'],
  'Chave duplicada.': ['Duplicate key.', '密钥重复。'],
  'Chave local incompatível.': ['Incompatible local key.', '本地密钥不兼容。'],
  'Chave recuperada divergente.': [
    'Recovered key does not match.',
    '恢复的密钥不匹配。',
  ],
  'Chave Solana inválida.': ['Invalid Solana key.', 'Solana 密钥无效。'],
  'Chaves de origem divergentes.': [
    'Source keys do not match.',
    '来源密钥不匹配。',
  ],
  'Chaves locais inválidas.': ['Invalid local keys.', '本地密钥无效。'],
  'Checkpoint antigo.': ['Old checkpoint.', '旧检查点。'],
  'Checkpoint inválido.': ['Invalid checkpoint.', '检查点无效。'],
  'Checkpoint local corrompido.': [
    'Local checkpoint corrupted.',
    '本地检查点损坏。',
  ],
  'Checkpoint local inválido.': [
    'Invalid local checkpoint.',
    '本地检查点无效。',
  ],
  'Checkpoint mudou durante a migração.': [
    'Checkpoint changed during migration.',
    '迁移期间检查点已更改。',
  ],
  'Checks de grupo inválidos.': [
    'Invalid group delivery checks.',
    '群组送达状态无效。',
  ],
  'Classificar comunidades': ['Sort communities', '排序社区'],
  'Cliente {0}': ['Client {0}', '客户端 {0}'],
  'Cliente indisponível.': ['Client unavailable.', '客户端不可用。'],
  'Cliente iniciado. Copie a chave pública da outra tela para autorizar.': [
    'Client started. Copy the public key from the other screen to authorize.',
    '客户端已启动。请复制另一个页面的公钥以授权。',
  ],
  'Cliente inválido.': ['Invalid client.', '客户端无效。'],
  'Codificação do ensaio inválida.': [
    'Invalid test encoding.',
    '测试编码无效。',
  ],
  'Codificação do registro não suportada.': [
    'Unsupported record encoding.',
    '不支持此记录编码。',
  ],
  'Código de confirmação não confere. Confira no aparelho que autorizou.': [
    'Confirmation code does not match. Check it on the authorizing device.',
    '确认码不匹配。请在授权设备上核对。',
  ],
  'Código diverge da identidade conhecida da conta.': [
    "Code differs from the account's known identity.",
    '代码与账户的已知身份不一致。',
  ],
  'Código e licenças': ['Source code and licenses', '源代码与许可证'],
  'Código excedido.': ['Code exceeds the limit.', '代码超过限制。'],
  'Código expirado.': ['Code expired.', '代码已过期。'],
  'Código expirado. Gere um novo código para vincular.': [
    'Code expired. Generate a new linking code.',
    '代码已过期。请生成新的关联码。',
  ],
  'Código inválido. Copie um código ou link válido do aparelho conectado.': [
    'Invalid code. Copy a valid code or link from the connected device.',
    '代码无效。请从已连接设备复制有效代码或链接。',
  ],
  'Código não encontrado. Confira o registro e aguarde a propagação do DNS.': [
    'Code not found. Check the record and wait for DNS propagation.',
    '未找到代码。请检查记录并等待 DNS 生效。',
  ],
  Cofre: ['Vault', '保险库'],
  'Cofre cifrado localmente em {0} ms. Apenas o envelope pode ser guardado no relay.':
    [
      'Vault encrypted locally in {0} ms. Only the envelope may be stored on the relay.',
      '保险库已在本地加密，耗时 {0} 毫秒。中继仅可保存加密封装。',
    ],
  'Cofre e backup': ['Vault and backup', '保险库与备份'],
  'Cofre pertence a outra identidade.': [
    'Vault belongs to another identity.',
    '保险库属于另一个身份。',
  ],
  'Cofre rejeitado pelo relay.': [
    'Vault rejected by the relay.',
    '中继拒绝了保险库。',
  ],
  'Cofre rejeitado: segredo ou integridade inválidos.': [
    'Vault rejected: invalid secret or integrity.',
    '保险库被拒绝：密钥或完整性无效。',
  ],
  'Cofre remoto divergente do checkpoint.': [
    'Remote vault differs from checkpoint.',
    '远程保险库与检查点不一致。',
  ],
  'Cofre resetado: {0} MB liberados. O histórico importado continua neste aparelho.':
    [
      'Vault reset: {0} MB freed. Imported history remains on this device.',
      '保险库已重置：释放了 {0} MB。导入的历史仍保留在此设备上。',
    ],
  'Coleta indisponível.': ['Collection unavailable.', '采集不可用。'],
  'Com a conta conectada, a escolha acompanha a conta e pode ser alterada no Perfil.':
    [
      'When signed in, this choice follows your account and can be changed in Profile.',
      '登录后，此选项随账户同步，可在“个人资料”中更改。',
    ],
  'Comece a conversa nesta comunidade.': [
    'Start the conversation in this community.',
    '在此社区开始对话。',
  ],
  comentários: ['comments', '评论'],
  'Comida e bebida': ['Food and drink', '食物与饮料'],
  Compartilhado: ['Shared', '已分享'],
  Compartilhar: ['Share', '分享'],
  'Compartilhar no meu perfil': ['Share on my profile', '分享到我的个人资料'],
  'Compartilhe com uma comunidade.': [
    'Share with a community.',
    '分享到社区。',
  ],
  Compartilhou: ['Shared', '分享了'],
  'Comprimento inválido.': ['Invalid length.', '长度无效。'],
  'Comprovante divergente.': ['Receipt does not match.', '凭据不匹配。'],
  'Comprovante repetido.': ['Duplicate receipt.', '凭据重复。'],
  'Comprovantes de limpeza incompletos. Confira o estado antes de continuar.': [
    'Cleanup receipts incomplete. Check the state before continuing.',
    '清理凭据不完整。请确认状态后继续。',
  ],
  Comunidade: ['Community', '社区'],
  'Comunidade {0}': ['Community {0}', '社区 {0}'],
  'Comunidade arquivada': ['Archived community', '已归档社区'],
  'Comunidade indisponível.': ['Community unavailable.', '社区不可用。'],
  Comunidades: ['Communities', '社区'],
  'Comunidades · Leitura aberta': [
    'Communities · Open access',
    '社区 · 公开阅读',
  ],
  'Comunidades ou mensagens pelo @': [
    'Communities or handle messages',
    '社区或用户名私信',
  ],
  'Comunidades recém-criadas': ['New communities', '新建社区'],
  'Comunidades são públicas e gratuitas. Qualquer perfil público autorizado pode participar sem precisar seguir.':
    [
      'Communities are public and free. Any authorized public profile can participate without following.',
      '社区公开且免费。任何获授权的公开个人资料都可参与，无需关注。',
    ],
  'Comunidades seguidas': ['Followed communities', '已关注社区'],
  'Conclua a operação ou salve suas alterações antes de atualizar.': [
    'Finish the operation or save your changes before updating.',
    '请完成操作或保存更改后再更新。',
  ],
  'Conclua a sincronização antes de salvar a privacidade.': [
    'Finish syncing before saving privacy settings.',
    '请完成同步后再保存隐私设置。',
  ],
  'Conclua a vinculação ou feche a câmera em Perfil → Aparelhos antes de atualizar.':
    [
      'Finish linking or close the camera in Profile → Devices before updating.',
      '请完成关联，或在“个人资料 → 设备”中关闭摄像头后再更新。',
    ],
  'Conclua ou cancele {0} antes de atualizar.': [
    'Complete or cancel {0} before updating.',
    '请完成或取消{0}后再更新。',
  ],
  'Conclua ou cancele o pedido de recuperação anterior.': [
    'Complete or cancel the previous recovery request.',
    '请完成或取消先前的恢复请求。',
  ],
  Concluído: ['Done', '已完成'],
  'Concluir emissão': ['Complete issuance', '完成签发'],
  'Concluir registro da organização': [
    'Complete organization registration',
    '完成组织注册',
  ],
  'Conectado com sucesso': ['Successfully connected', '连接成功'],
  'Conectado: sincronize antes de abrir o histórico.': [
    'Connected: sync before opening history.',
    '已连接：请先同步，再打开历史记录。',
  ],
  'Conectando recebimento em tempo real…': [
    'Connecting live updates…',
    '正在连接实时更新…',
  ],
  'Conectando…': ['Connecting…', '正在连接…'],
  'Conecte a wallet original ou abra uma cópia local autorizada.': [
    'Connect the original wallet or open an authorized local copy.',
    '请连接原钱包，或打开已获授权的本地副本。',
  ],
  'Conecte a wallet original primeiro.': [
    'Connect the original wallet first.',
    '请先连接原钱包。',
  ],
  'Conecte e autorize este aparelho para selecionar conteúdo remoto.': [
    'Connect and authorize this device to select remote content.',
    '请连接并授权此设备以选择远程内容。',
  ],
  'Conecte e autorize o aparelho para sincronizar.': [
    'Connect and authorize the device to sync.',
    '请连接并授权此设备以同步。',
  ],
  'Conecte e autorize seu aparelho para gerenciar o perfil público.': [
    'Connect and authorize your device to manage your public profile.',
    '请连接并授权设备以管理公开个人资料。',
  ],
  'Conecte sua wallet para entrar.': [
    'Connect your wallet to sign in.',
    '连接钱包以登录。',
  ],
  'Conecte-se para abrir os status atuais.': [
    'Connect to open current statuses.',
    '请联网以打开当前状态。',
  ],
  'Conecte-se para conferir a participação atual do grupo.': [
    'Connect to check current group membership.',
    '请联网以检查当前群组成员。',
  ],
  'Conexão ausente.': ['Connection missing.', '缺少连接。'],
  'Conexão confirmada. Toque em “Confirmar mensagem na Phantom”, confira a mensagem de teste e assine. A wallet solicitará o retorno a este site.':
    [
      'Connection confirmed. Tap “Confirm message in Phantom”, check the test message and sign. Your wallet will request a return to this site.',
      '连接已确认。请点击“在 Phantom 中确认消息”，检查测试消息并签名。钱包将请求返回此网站。',
    ],
  'Conexão direta rejeitada.': [
    'Direct connection rejected.',
    '直接连接被拒绝。',
  ],
  'Conexão disponível · nenhuma conta conectada': [
    'Connection available · no account connected',
    '网络可用 · 尚未连接账户',
  ],
  'Conexão encerrada.': ['Connection ended.', '连接已结束。'],
  'Conferência de mensagens substituída por novo aviso.': [
    'Message verification superseded by a new notice.',
    '消息核验已被新通知替代。',
  ],
  'Conferir estado': ['Check state', '检查状态'],
  'Configuração aplicada neste aparelho, mas não salva na conta': [
    'Setting applied on this device, but not saved to your account',
    '设置已在此设备上应用，但尚未保存到账户',
  ],
  'Configuração da conta inválida.': [
    'Invalid account settings.',
    '账户设置无效。',
  ],
  'Configuração indisponível.': ['Settings unavailable.', '设置不可用。'],
  'Configuração pertence a outra conta.': [
    'Settings belong to another account.',
    '设置属于另一个账户。',
  ],
  'Configurações da conta': ['Account settings', '账户设置'],
  'Configurações da conta com versões demais no cofre.': [
    'Too many account settings versions in the vault.',
    '保险库中的账户设置版本过多。',
  ],
  'Configurações iniciais': ['Initial settings', '初始设置'],
  'Configurações iniciais indisponíveis.': [
    'Initial settings unavailable.',
    '初始设置不可用。',
  ],
  'Confira a autorização deste aparelho para abrir os status.': [
    "Check this device's authorization to open statuses.",
    '请检查此设备的授权以打开状态。',
  ],
  'Confira a foto e toque em Publicar status.': [
    'Check the photo and tap Publish status.',
    '请检查图片，然后点击“发布状态”。',
  ],
  'Confira domínio e endereço na wallet e assine somente o pedido de login.': [
    'Check the domain and address in your wallet and sign only the sign-in request.',
    '请核对钱包中的域名和地址，并仅签署登录请求。',
  ],
  'Confira o apelido particular e salve explicitamente na agenda.': [
    'Check the private nickname and explicitly save it in contacts.',
    '请核对私密备注名，并主动保存到联系人。',
  ],
  'Confira um código válido antes de autorizar.': [
    'Check a valid code before authorizing.',
    '授权前请核对有效代码。',
  ],
  'Confirmação de autorização divergente. Atualize para verificar o estado persistido.':
    [
      'Authorization confirmation does not match. Refresh to check the saved state.',
      '授权确认不匹配。请刷新以检查已保存的状态。',
    ],
  'Confirmação de limpeza inválida. Confira o estado antes de repetir.': [
    'Invalid cleanup confirmation. Check the state before retrying.',
    '清理确认无效。请检查状态后重试。',
  ],
  'Confirmação divergente. Rascunho preservado; sincronize para conferir.': [
    'Confirmation does not match. Draft preserved; sync to check.',
    '确认不匹配。草稿已保留；请同步以核对。',
  ],
  'Confirmação inválida para QR Code.': [
    'Invalid QR code confirmation.',
    '二维码确认无效。',
  ],
  'Confirmações de DM inválidas.': [
    'Invalid DM confirmations.',
    '私信确认无效。',
  ],
  'Confirmações inválidas.': ['Invalid confirmations.', '确认信息无效。'],
  'Confirmar alterações': ['Confirm changes', '确认更改'],
  'Confirmar assinatura': ['Confirm signature', '确认签名'],
  'Confirmar assinatura · 0xDMme': [
    'Confirm signature · 0xDMme',
    '确认签名 · 0xDMme',
  ],
  'Confirmar assinatura na {0}': [
    'Confirm signature in {0}',
    '在 {0} 中确认签名',
  ],
  'Confirmar mensagem na Phantom': [
    'Confirm message in Phantom',
    '在 Phantom 中确认消息',
  ],
  'Confirmar reset do cofre': ['Confirm vault reset', '确认重置保险库'],
  'Confirme a abertura da conta na sua wallet.': [
    'Confirm account opening in your wallet.',
    '请在钱包中确认打开账户。',
  ],
  'Confirme a alteração de participação.': [
    'Confirm the membership change.',
    '确认成员变更。',
  ],
  'Confirme a assinatura do pedido iniciado no seu navegador.': [
    'Confirm the signature for the request started in your browser.',
    '请确认在你浏览器中发起的请求签名。',
  ],
  'Confirme a assinatura para concluir o login no navegador que iniciou o pedido. Recuse pedidos recebidos de terceiros.':
    [
      'Confirm the signature to complete sign-in in the browser that started the request. Reject requests received from others.',
      '请确认签名，以在发起请求的浏览器中完成登录。请拒绝他人发来的请求。',
    ],
  'Confirme a chave do outro cliente antes de enviar.': [
    "Confirm the other client's key before sending.",
    '发送前请确认另一个客户端的密钥。',
  ],
  'Confirme a chave do outro cliente antes de receber.': [
    "Confirm the other client's key before receiving.",
    '接收前请确认另一个客户端的密钥。',
  ],
  'Confirme a conexão na {0}.': [
    'Confirm the connection in {0}.',
    '请在 {0} 中确认连接。',
  ],
  'Confirme a conexão na Phantom. Se a abertura for bloqueada, toque em “Abrir Phantom”.':
    [
      'Confirm the connection in Phantom. If opening is blocked, tap “Open Phantom”.',
      '请在 Phantom 中确认连接。如果无法打开，请点击“打开 Phantom”。',
    ],
  'Confirme a criação do perfil público.': [
    'Confirm public profile creation.',
    '确认创建公开个人资料。',
  ],
  'Confirme a exclusão da postagem.': [
    'Confirm post deletion.',
    '确认删除帖子。',
  ],
  'Confirme a exclusão do badge.': [
    'Confirm badge deletion.',
    '确认删除徽章。',
  ],
  'Confirme a wallet da conta que já está aberta neste aparelho.': [
    'Confirm the wallet for the account already open on this device.',
    '请确认此设备上已打开账户的钱包。',
  ],
  'Confirme a wallet da sua conta para liberar as ações sensíveis nesta sessão.':
    [
      "Confirm your account's wallet to enable sensitive actions in this session.",
      '请确认账户钱包，以在此会话中执行敏感操作。',
    ],
  'Confirme a wallet para vincular outro aparelho.': [
    'Confirm your wallet to link another device.',
    '请确认钱包以关联另一台设备。',
  ],
  'Confirme o login no seu navegador': [
    'Confirm sign-in in your browser',
    '在浏览器中确认登录',
  ],
  'Confirme sua wallet uma vez nesta sessão e volte ao Cofre para concluir o reset.':
    [
      'Confirm your wallet once in this session, then return to Vault to complete the reset.',
      '请在此会话中确认一次钱包，然后返回“保险库”完成重置。',
    ],
  'Conflito ou limite de mensagens do ensaio.': [
    'Conflict or test message limit reached.',
    '发生冲突或达到测试消息上限。',
  ],
  'Consulta de chaves de grupo incompleta. Retome o envio após atualizar.': [
    'Group key lookup incomplete. Refresh before resuming the send.',
    '群组密钥查询不完整。请刷新后再恢复发送。',
  ],
  'Consulta de convite inválida.': [
    'Invalid invitation lookup.',
    '邀请查询无效。',
  ],
  'Consulta em {0}: {1}': ['Lookup at {0}: {1}', '在 {0} 查询：{1}'],
  'Consultando armazenamento…': ['Checking storage…', '正在检查存储空间…'],
  'Consultando contatos da conta…': [
    'Checking account contacts…',
    '正在查询账户联系人…',
  ],
  'Consultando disponibilidade de grupos…': [
    'Checking group availability…',
    '正在查询群组可用性…',
  ],
  'Consultando uso da conta…': ['Checking account usage…', '正在查询账户用量…'],
  'Consultando…': ['Checking…', '正在查询…'],
  'Consultar histórico de moderação': [
    'View moderation history',
    '查看审核历史',
  ],
  'Conta alterada.': ['Account changed.', '账户已更改。'],
  'Conta conectada': ['Account connected', '账户已连接'],
  'Conta de grupo ausente.': ['Group account missing.', '缺少群组账户。'],
  'Conta divergente no diretório.': [
    'Account does not match the directory.',
    '账户与目录不匹配。',
  ],
  'Conta do ensaio não canônica.': [
    'Test account is not canonical.',
    '测试账户格式不规范。',
  ],
  'Conta EVM / Solana · Mensagens privadas': [
    'EVM / Solana account · Private messages',
    'EVM / Solana 账户 · 私密消息',
  ],
  'Conta não conectada': ['No account connected', '尚未连接账户'],
  'Conta pronta.': ['Account ready.', '账户已就绪。'],
  'Conta removida': ['Removed account', '已移除账户'],
  'Conta: {0}': ['Account: {0}', '账户：{0}'],
  'Contagem disponível; esta visualização não pôde ser confirmada.': [
    'Count available; this view could not be confirmed.',
    '浏览数可用；本次浏览未能确认。',
  ],
  'Contagem indisponível.': ['Count unavailable.', '浏览数不可用。'],
  Contato: ['Contact', '联系人'],
  'Contato {0}': ['Contact {0}', '联系人 {0}'],
  'Contato aberto apenas neste aparelho.': [
    'Contact opened only on this device.',
    '联系人仅在此设备上打开。',
  ],
  'Contato adicionado ao grupo.': [
    'Contact added to the group.',
    '联系人已添加到群组。',
  ],
  'Contato aprovado {0}': ['Approved contact {0}', '已批准联系人 {0}'],
  'Contato aprovado nos dois sentidos.': [
    'Contact approved in both directions.',
    '双方已批准联系。',
  ],
  'Contato para encaminhar': ['Contact to forward to', '转发给联系人'],
  'Contato particular confirmado no cofre. Isso não aprovou conversa.': [
    'Private contact confirmed in the vault. This did not approve a conversation.',
    '私密联系人已在保险库中确认。这不代表批准聊天。',
  ],
  'Contato representante': ['Representative contact', '代表联系人'],
  'Contato salvo neste aparelho. Será enviado quando a conexão voltar.': [
    'Contact saved on this device. It will be sent when the connection returns.',
    '联系人已保存在此设备上。恢复连接后会发送。',
  ],
  Contatos: ['Contacts', '联系人'],
  'Contatos atualizados.': ['Contacts updated.', '联系人已更新。'],
  'Contatos excedem o limite do backup.': [
    'Contacts exceed the backup limit.',
    '联系人超过备份上限。',
  ],
  'Contestação da remoção': ['Removal appeal', '移除申诉'],
  'Contestação registrada para revisão excepcional.': [
    'Appeal recorded for exceptional review.',
    '申诉已记录，等待特殊复核。',
  ],
  'Contestação: {0}': ['Appeal: {0}', '申诉：{0}'],
  'Contestar análise': ['Appeal analysis', '对分析结果申诉'],
  'Contestar remoção': ['Appeal removal', '对移除决定申诉'],
  'Contestar sanção': ['Appeal sanction', '对处罚申诉'],
  'Conteúdo analisado': ['Analyzed content', '已分析内容'],
  'Conteúdo de grupo excedido.': [
    'Group content exceeds the limit.',
    '群组内容超过限制。',
  ],
  'Conteúdo de grupo não corresponde ao pacote autenticado.': [
    'Group content does not match the authenticated package.',
    '群组内容与已验证的数据包不一致。',
  ],
  'Conteúdo de status divergente.': [
    'Status content does not match.',
    '状态内容不匹配。',
  ],
  'Conteúdo deve ter até 3 MB.': [
    'Content must be no larger than 3 MB.',
    '内容大小不得超过 3 MB。',
  ],
  'Conteúdo do cofre excedido.': [
    'Vault content exceeds the limit.',
    '保险库内容超过限制。',
  ],
  'Conteúdo excede o tamanho permitido.': [
    'Content exceeds the permitted size.',
    '内容超过允许的大小。',
  ],
  'Conteúdo excluído pelo autor.': [
    'Content deleted by the author.',
    '内容已被作者删除。',
  ],
  'Conteúdo fictício inválido.': [
    'Invalid fictional content.',
    '虚构内容无效。',
  ],
  'Conteúdo local diverge da mensagem de grupo.': [
    'Local content differs from the group message.',
    '本地内容与群组消息不一致。',
  ],
  'Conteúdo local diverge do cofre remoto.': [
    'Local content differs from the remote vault.',
    '本地内容与远程保险库不一致。',
  ],
  'Conteúdo local divergente do pacote verificado.': [
    'Local content differs from the verified package.',
    '本地内容与已验证的数据包不一致。',
  ],
  'Conteúdo não corresponde à mensagem autenticada.': [
    'Content does not match the authenticated message.',
    '内容与已验证的消息不一致。',
  ],
  'Conteúdo ocultado pela moderação.': [
    'Content hidden by moderation.',
    '内容已被审核隐藏。',
  ],
  'Conteúdo oculto dos seus feeds': [
    'Content hidden from your feeds',
    '已从你的动态中隐藏的内容',
  ],
  'Conteúdo restrito ao autor e gestores.': [
    'Content restricted to the author and managers.',
    '内容仅作者与管理员可见。',
  ],
  'Continuar editando': ['Keep editing', '继续编辑'],
  'Continuar este fio →': ['Continue this thread →', '继续此讨论串 →'],
  'Continue a conversa.': ['Continue the conversation.', '继续对话。'],
  'Continue carregando antes de retomar.': [
    'Continue loading before resuming.',
    '请继续加载后再恢复。',
  ],
  'Continue carregando as remoções pessoais.': [
    'Continue loading personal removals.',
    '继续加载个人移除记录。',
  ],
  'Continue carregando o cofre antes de editar.': [
    'Continue loading the vault before editing.',
    '请继续加载保险库后再编辑。',
  ],
  'Continue nesta wallet para abrir as chaves da sua conta.': [
    "Continue in this wallet to open your account's keys.",
    '请继续在此钱包中操作，以打开账户密钥。',
  ],
  'Continue sincronizando as remoções pessoais antes de abrir conteúdo.': [
    'Continue syncing personal removals before opening content.',
    '请继续同步个人移除记录后再打开内容。',
  ],
  'Continue sincronizando o histórico de DMs.': [
    'Continue syncing DM history.',
    '继续同步私信历史。',
  ],
  'Controle do domínio verificado': [
    'Domain control verified',
    '域名控制权已验证',
  ],
  'Controle do domínio verificado.': [
    'Domain control verified.',
    '域名控制权已验证。',
  ],
  Conversa: ['Conversation', '对话'],
  'Conversa alterada.': ['Conversation changed.', '对话已更改。'],
  'Conversa do backup': ['Backup conversation', '备份对话'],
  'Conversa do histórico local': ['Local history conversation', '本地历史对话'],
  'Conversa histórica de outra DM.': [
    'Historical conversation belongs to another DM.',
    '历史对话属于另一条私信。',
  ],
  'Conversa histórica de outro grupo.': [
    'Historical conversation belongs to another group.',
    '历史对话属于另一个群组。',
  ],
  'Conversa histórica inválida.': [
    'Invalid historical conversation.',
    '历史对话无效。',
  ],
  'Conversa pelo @ incompleta.': [
    'Handle conversation incomplete.',
    '用户名对话不完整。',
  ],
  Conversar: ['Chat', '聊天'],
  Conversas: ['Conversations', '对话'],
  'Conversas atualizadas.': ['Conversations updated.', '对话已更新。'],
  'Conversas e arquivos ficam cifrados. Salvar um backup não libera espaço automaticamente.':
    [
      'Conversations and files stay encrypted. Saving a backup does not automatically free space.',
      '对话和文件保持加密。保存备份不会自动释放空间。',
    ],
  'Conversas geradas': ['Conversations started', '发起的讨论'],
  'Convite ativo, mas a cópia cifrada não foi confirmada. Guarde o link ou revogue-o antes de sair.':
    [
      'Invitation active, but its encrypted copy was not confirmed. Keep the link or revoke it before leaving.',
      '邀请已启用，但加密副本未确认。离开前请保留链接或撤销邀请。',
    ],
  'Convite ativo; a cópia cifrada será enviada automaticamente ao reconectar.':
    [
      'Invitation active; its encrypted copy will be sent automatically when reconnected.',
      '邀请已启用；恢复连接后会自动发送加密副本。',
    ],
  'Convite de grupo inválido.': ['Invalid group invitation.', '群组邀请无效。'],
  'Convite de outra conta.': [
    'Invitation belongs to another account.',
    '邀请属于另一个账户。',
  ],
  'Convite indisponível, revogado ou restrito pela privacidade atual.': [
    'Invitation unavailable, revoked or restricted by current privacy settings.',
    '邀请不可用、已撤销，或受当前隐私设置限制。',
  ],
  'Convite inválido. Confira o link completo.': [
    'Invalid invitation. Check the full link.',
    '邀请无效。请核对完整链接。',
  ],
  'Convite recusado.': ['Invitation declined.', '邀请已拒绝。'],
  'Convite revogado. Links antigos não permitem novas solicitações.': [
    'Invitation revoked. Old links cannot start new requests.',
    '邀请已撤销。旧链接无法发起新请求。',
  ],
  'Convite sem participação administrativa verificada.': [
    'Invitation has no verified administrative membership.',
    '邀请缺少已验证的管理成员身份。',
  ],
  'Convites de grupo': ['Group invitations', '群组邀请'],
  'Convites de grupo inválidos.': [
    'Invalid group invitations.',
    '群组邀请无效。',
  ],
  'Cópia de DM diverge do histórico preservado.': [
    'DM copy differs from preserved history.',
    '私信副本与保留的历史不一致。',
  ],
  'Cópia de grupo diverge do histórico preservado.': [
    'Group copy differs from preserved history.',
    '群组副本与保留的历史不一致。',
  ],
  'Cópia de outro grupo ou conta.': [
    'Copy belongs to another group or account.',
    '副本属于另一个群组或账户。',
  ],
  'Cópia histórica de outra conta ou grupo.': [
    'Historical copy belongs to another account or group.',
    '历史副本属于另一个账户或群组。',
  ],
  'Cópia local': ['Local copy', '本地副本'],
  'Cópia local · conteúdo indisponível no cofre remoto': [
    'Local copy · content unavailable in the remote vault',
    '本地副本 · 远程保险库中的内容不可用',
  ],
  'Cópia local apenas. Entre e confira a autorização para sincronizar com o servidor.':
    [
      'Local copy only. Sign in and check authorization to sync with the server.',
      '仅有本地副本。请登录并核对授权后与服务器同步。',
    ],
  'Cópia local de grupo ausente.': [
    'Local group copy missing.',
    '缺少群组本地副本。',
  ],
  'cópia local do grupo': ['local group copy', '群组本地副本'],
  'Cópia local independente · sem acesso remoto concedido por esta cópia': [
    'Independent local copy · this copy grants no remote access',
    '独立本地副本 · 此副本不授予远程访问权限',
  ],
  'Cópia local independente. Envio e administração exigem participação atual verificada.':
    [
      'Independent local copy. Sending and administration require verified current membership.',
      '独立本地副本。发送和管理需要验证当前成员身份。',
    ],
  'Cópia local não autorizada.': [
    'Local copy not authorized.',
    '本地副本未获授权。',
  ],
  'Cópia local não confirmada. Verifique espaço e armazenamento do navegador.':
    [
      'Local copy not confirmed. Check browser storage and available space.',
      '本地副本未确认。请检查浏览器存储和可用空间。',
    ],
  'Cópia local offline · estado remoto ainda não conferido': [
    'Offline local copy · remote state not yet checked',
    '离线本地副本 · 尚未核对远程状态',
  ],
  'Cópia local. Conecte para sincronizar e enviar mensagens.': [
    'Local copy. Connect to sync and send messages.',
    '本地副本。联网后可同步和发送消息。',
  ],
  'Cópia neste aparelho': ['Copy on this device', '此设备上的副本'],
  'Cópia verificada inválida.': ['Invalid verified copy.', '已验证副本无效。'],
  'Copiar texto': ['Copy text', '复制文字'],
  'Cópias históricas divergentes. Preserve os arquivos originais antes de resolver.':
    [
      'Historical copies differ. Preserve the original files before resolving.',
      '历史副本不一致。解决前请保留原始文件。',
    ],
  'Cópias locais de grupo divergentes.': [
    'Local group copies do not match.',
    '群组本地副本不匹配。',
  ],
  'Cor da marca': ['Brand color', '品牌颜色'],
  Corrigir: ['Correct', '修正'],
  'Corrigir imagem {0} · marcação atual: {1}': [
    'Correct image {0} · current annotation: {1}',
    '修正图片 {0} · 当前标注：{1}',
  ],
  'Credencial TURN ausente.': ['TURN credential missing.', '缺少 TURN 凭据。'],
  'Criação gratuita, sem limite de quantidade. Até uma criação por minuto e dez por hora.':
    [
      'Free creation, with no total limit. Up to one creation per minute and ten per hour.',
      '免费创建，总数量不限。每分钟最多创建 1 个，每小时最多 10 个。',
    ],
  'Criação local inválida.': ['Invalid local creation.', '本地创建无效。'],
  'Criação não confirmada. Retome o mesmo pedido.': [
    'Creation not confirmed. Resume the same request.',
    '创建未确认。请继续同一请求。',
  ],
  'Criada em {0}': ['Created on {0}', '创建于 {0}'],
  'Criar badge': ['Create badge', '创建徽章'],
  'Criar comunidade': ['Create community', '创建社区'],
  'Criar convite': ['Create invitation', '创建邀请'],
  'Criar e assinar organização': [
    'Create and sign organization',
    '创建组织并签名',
  ],
  'Criar grupo': ['Create group', '创建群组'],
  'Criar grupo privado': ['Create private group', '创建私密群组'],
  'Criar perfil para seguir': [
    'Create profile to follow',
    '创建个人资料以关注',
  ],
  'Criar postagem': ['Create post', '创建帖子'],
  'Criar tag': ['Create tag', '创建标签'],
  'Crie outro contato para outra wallet.': [
    'Create another contact for a different wallet.',
    '请为其他钱包创建新的联系人。',
  ],
  'Crie seu perfil público para seguir.': [
    'Create your public profile to follow.',
    '创建公开个人资料即可关注。',
  ],
  'Crie seu perfil público primeiro.': [
    'Create your public profile first.',
    '请先创建公开个人资料。',
  ],
  'Crie um convite primeiro.': [
    'Create an invitation first.',
    '请先创建邀请。',
  ],
  'Dados após o encerramento do backup.': [
    'Data after backup completion.',
    '备份结束后仍有数据。',
  ],
  'Data de criação não registrada': [
    'Creation date not recorded',
    '未记录创建日期',
  ],
  'Data não registrada': ['Date not recorded', '未记录日期'],
  'Dê um título à postagem.': ['Give your post a title.', '为帖子添加标题。'],
  'Deixar de seguir': ['Unfollow', '取消关注'],
  'Denúncia enviada.': ['Report sent.', '举报已发送。'],
  'Denúncia guardada no backend do app.': [
    "Report saved on the app's backend.",
    '举报已保存在应用后端。',
  ],
  'Denúncia não confirmada.': ['Report not confirmed.', '举报未确认。'],
  Denunciar: ['Report', '举报'],
  'Denunciar postagem': ['Report post', '举报帖子'],
  'Denunciar usuário': ['Report user', '举报用户'],
  'Denúncias da comunidade': ['Community reports', '社区举报'],
  Desafixar: ['Unpin', '取消置顶'],
  Desarquivar: ['Unarchive', '取消归档'],
  'Desarquive a conversa antes de alterar ou retomar os alertas.': [
    'Unarchive the conversation before changing or resuming alerts.',
    '请先取消归档对话，再更改或恢复通知。',
  ],
  'Desativar notificações de posts e respostas': [
    'Disable post and reply notifications',
    '关闭帖子与回复通知',
  ],
  'Desativar recebimento de chamadas': ['Disable incoming calls', '关闭来电'],
  'Desativar sons': ['Disable sounds', '关闭声音'],
  Desbloquear: ['Unblock', '解除屏蔽'],
  'Desbloquear usuário': ['Unblock user', '解除用户屏蔽'],
  Descartar: ['Discard', '丢弃'],
  'Descartar postagem?': ['Discard post?', '丢弃帖子？'],
  'Descartar rascunho local': ['Discard local draft', '丢弃本地草稿'],
  'Descartar resposta?': ['Discard reply?', '丢弃回复？'],
  Descobrir: ['Discover', '探索'],
  Descrição: ['Description', '简介'],
  'Desenho de emoji inválido.': ['Invalid emoji artwork.', '表情图案无效。'],
  'Desenho do aparelho: pacote gráfico indisponível.': [
    'Device artwork: graphic package unavailable.',
    '使用设备表情：图案包不可用。',
  ],
  'Desenhos de emojis ausentes.': ['Emoji artwork missing.', '缺少表情图案。'],
  'Desenhos de emojis incompletos.': [
    'Emoji artwork incomplete.',
    '表情图案不完整。',
  ],
  'Desenhos indisponíveis. Você ainda pode escolher o emoji com a aparência deste aparelho.':
    [
      "Artwork unavailable. You can still choose emoji using this device's appearance.",
      '表情图案不可用。你仍可选择使用此设备样式的表情。',
    ],
  'Desenhos Twemoji · CC-BY-4.0 · Recentes só nesta sessão': [
    'Twemoji artwork · CC-BY-4.0 · Recents only in this session',
    'Twemoji 图案 · CC-BY-4.0 · 最近使用仅保留于此会话',
  ],
  Destaques: ['Highlights', '精选'],
  'Destinatário, recuperação ou texto ausente.': [
    'Recipient, recovery or text missing.',
    '缺少接收者、恢复信息或文字。',
  ],
  'Destino alterado.': ['Destination changed.', '目标已更改。'],
  'Destino da entrada alterado.': [
    'Sign-in destination changed.',
    '登录目标已更改。',
  ],
  'Destino da wallet alterado.': [
    'Wallet destination changed.',
    '钱包目标已更改。',
  ],
  'Desvincular domínio': ['Unlink domain', '取消关联域名'],
  Detectada: ['Detected', '已检测到'],
  'Digite para encontrar uma conversa ou busque palavras nas mensagens.': [
    'Type to find a conversation or search for words in messages.',
    '输入以查找对话，或搜索消息中的文字。',
  ],
  'Diretório antigo do contato.': [
    'Old contact directory.',
    '联系人目录已过时。',
  ],
  'Diretório antigo, omitido ou divergente.': [
    'Directory outdated, omitted or inconsistent.',
    '目录过时、缺失或不一致。',
  ],
  'Diretório ausente.': ['Directory missing.', '缺少目录。'],
  'Diretório da chamada divergente.': [
    'Call directory does not match.',
    '通话目录不匹配。',
  ],
  'Diretório de DMs ausente.': ['DM directory missing.', '缺少私信目录。'],
  'Diretório de DMs desapareceu.': [
    'DM directory disappeared.',
    '私信目录已消失。',
  ],
  'Diretório de DMs excedido.': [
    'DM directory exceeds the limit.',
    '私信目录超过限制。',
  ],
  'Diretório de DMs retrocedeu.': [
    'DM directory rolled back.',
    '私信目录已回退。',
  ],
  'Diretório de membro ausente.': [
    'Member directory missing.',
    '缺少成员目录。',
  ],
  'Diretório de origem mudou.': [
    'Source directory changed.',
    '来源目录已更改。',
  ],
  'Diretório de outra página ou repetido.': [
    'Directory belongs to another page or is duplicated.',
    '目录属于其他页面或已重复。',
  ],
  'Diretório de outro perfil público.': [
    'Directory belongs to another public profile.',
    '目录属于另一个公开个人资料。',
  ],
  'Diretório diverge da identidade fixada.': [
    'Directory differs from the pinned identity.',
    '目录与固定身份不一致。',
  ],
  'Diretório divergente do contato.': [
    'Contact directory does not match.',
    '联系人目录不匹配。',
  ],
  'Diretório divergente.': ['Directory does not match.', '目录不匹配。'],
  'Diretório do autor excedido.': [
    'Author directory exceeds the limit.',
    '作者目录超过限制。',
  ],
  'Diretório do contato ausente.': [
    'Contact directory missing.',
    '缺少联系人目录。',
  ],
  'Diretório do contato excedido.': [
    'Contact directory exceeds the limit.',
    '联系人目录超过限制。',
  ],
  'Diretório do contato inválido.': [
    'Invalid contact directory.',
    '联系人目录无效。',
  ],
  'Diretório do contato omitido.': [
    'Contact directory omitted.',
    '联系人目录缺失。',
  ],
  'Diretório do grupo ausente.': ['Group directory missing.', '缺少群组目录。'],
  'Diretório excedido ou alterado repetidamente.': [
    'Directory exceeds the limit or changed repeatedly.',
    '目录超过限制或被反复更改。',
  ],
  'Diretório excedido.': ['Directory exceeds the limit.', '目录超过限制。'],
  'Diretório incompleto.': ['Directory incomplete.', '目录不完整。'],
  'Diretório omitido ou inválido.': [
    'Directory omitted or invalid.',
    '目录缺失或无效。',
  ],
  'Diretório omitido.': ['Directory omitted.', '目录缺失。'],
  'Diretório substituiu uma chave Matrix.': [
    'Directory replaced a Matrix key.',
    '目录替换了 Matrix 密钥。',
  ],
  'Diretórios de destinatários incompletos.': [
    'Recipient directories incomplete.',
    '接收者目录不完整。',
  ],
  'Diretórios fixados divergentes.': [
    'Pinned directories do not match.',
    '固定目录不匹配。',
  ],
  'Discussão da postagem': ['Post discussion', '帖子讨论'],
  'Disponível neste navegador': ['Available in this browser', '此浏览器中可用'],
  'Disponível para novos posts': ['Available for new posts', '可用于新帖子'],
  'Dispositivo ausente: envio permanece bloqueado.': [
    'Device missing: sending remains blocked.',
    '缺少设备：发送仍被阻止。',
  ],
  'Dispositivo revogado e sessão rotacionada. O outro cliente não abre o novo pacote; cópias anteriores continuam legíveis.':
    [
      'Device revoked and session rotated. The other client cannot open the new package; previous copies remain readable.',
      '设备授权已撤销，会话已轮换。另一客户端无法打开新数据包；旧副本仍可读取。',
    ],
  'Dispositivo revogado nesta sessão.': [
    'Device revoked in this session.',
    '此会话中的设备授权已撤销。',
  ],
  'Dispositivos alterados. Recarregue o perfil antes de salvar.': [
    'Devices changed. Reload the profile before saving.',
    '设备已更改。请重新加载个人资料后再保存。',
  ],
  'Dispositivos conectados': ['Connected devices', '已连接设备'],
  'DM encerrada.': ['DM ended.', '私信已结束。'],
  'DM indisponível.': ['DM unavailable.', '私信不可用。'],
  'dm-media:{0} indisponível': [
    'dm-media:{0} unavailable',
    'dm-media:{0} 不可用',
  ],
  'dm-message:{0} indisponível': [
    'dm-message:{0} unavailable',
    'dm-message:{0} 不可用',
  ],
  'DMs indisponíveis.': ['DMs unavailable.', '私信不可用。'],
  'DMs individuais · E2EE': [
    'Individual DMs · E2EE',
    '一对一私信 · 端到端加密',
  ],
  'Domínio (opcional)': ['Domain (optional)', '域名（选填）'],
  'Domínio desvinculado.': ['Domain unlinked.', '域名关联已取消。'],
  Dono: ['Owner', '所有者'],
  'Dono e moderadores': ['Owner and moderators', '所有者与管理员'],
  'Duas assinaturas iguais; pacote fictício cifrado e guardado. Recarregue e teste recuperar. Isto não comprova outro aparelho ou outra implementação da wallet.':
    [
      'Two identical signatures; fictional package encrypted and saved. Reload and test recovery. This does not verify another device or wallet implementation.',
      '两次签名一致；虚构数据包已加密并保存。请刷新并测试恢复。这不代表已验证其他设备或钱包实现。',
    ],
  Duração: ['Duration', '时长'],
  Edição: ['Edit', '编辑'],
  'Edição altera somente texto; remova o anexo selecionado.': [
    'Editing changes text only; remove the selected attachment.',
    '编辑仅更改文字；请移除所选附件。',
  ],
  'Edição por outro autor.': ['Edit by another author.', '编辑来自其他作者。'],
  Editada: ['Edited', '已编辑'],
  Editando: ['Editing', '正在编辑'],
  Editar: ['Edit', '编辑'],
  'Editar contato particular': ['Edit private contact', '编辑私密联系人'],
  'Editar perfil público': ['Edit public profile', '编辑公开个人资料'],
  'Editar postagem': ['Edit post', '编辑帖子'],
  'em formação': ['emerging', '成长中'],
  'Em resposta a @{0}': ['Replying to @{0}', '回复 @{0}'],
  'Em resposta a uma conta removida': [
    'Replying to a removed account',
    '回复已移除的账户',
  ],
  'Em resposta: {0}': ['Replying to: {0}', '回复：{0}'],
  'em uma postagem': ['in a post', '在帖子中'],
  'em uma resposta': ['in a reply', '在回复中'],
  'Emissão no futuro.': ['Issuance date is in the future.', '签发日期在未来。'],
  'Emissão registrada. Envie o cartão na conversa do representante.': [
    "Issuance recorded. Send the card in the representative's conversation.",
    '签发已记录。请在与代表的对话中发送卡片。',
  ],
  'Emissor: {0} · {1}': ['Issuer: {0} · {1}', '签发者：{0} · {1}'],
  'Emitir autorização': ['Issue authorization', '签发授权'],
  Emoji: ['Emoji', '表情'],
  Emojis: ['Emoji', '表情'],
  Encaminhada: ['Forwarded', '已转发'],
  Encaminhar: ['Forward', '转发'],
  'Encerrada: {0}': ['Ended: {0}', '已结束：{0}'],
  'Encerrando sessão…': ['Signing out…', '正在退出登录…'],
  Encerrar: ['End', '结束'],
  'Encerrar denúncia': ['Close report', '结束举报'],
  'Encerre a chamada atual primeiro.': [
    'End the current call first.',
    '请先结束当前通话。',
  ],
  'Encoder de imagem não compatível.': [
    'Incompatible image encoder.',
    '图片编码器不兼容。',
  ],
  'Endereço verificado ({0}): {1}. Confirme somente se é a conta que você escolheu.':
    [
      'Verified address ({0}): {1}. Only confirm if this is the account you chose.',
      '已验证地址（{0}）：{1}。仅在确为你选择的账户时确认。',
    ],
  'Endpoint fora do TURN rejeitado.': [
    'Non-TURN endpoint rejected.',
    '非 TURN 端点被拒绝。',
  ],
  'Ensaio em andamento. Confira a mensagem exclusiva na wallet.': [
    'Test in progress. Check the exclusive message in your wallet.',
    '测试正在进行。请核对钱包中的专用消息。',
  ],
  'Ensaio interrompido; recarregue antes de tentar novamente.': [
    'Test interrupted; reload before retrying.',
    '测试已中断；请刷新后重试。',
  ],
  'Ensaio recusado. Confira a conta, a assinatura e a disponibilidade do armazenamento; nenhum sucesso foi confirmado.':
    [
      'Test refused. Check the account, signature and storage availability; no success was confirmed.',
      '测试被拒绝。请检查账户、签名和存储可用性；未确认成功。',
    ],
  'Ensaio rejeitado. Confira os artefatos locais e a compatibilidade do navegador.':
    [
      'Test rejected. Check local artifacts and browser compatibility.',
      '测试被拒绝。请检查本地文件和浏览器兼容性。',
    ],
  'Entrada interrompida.': ['Sign-in interrupted.', '登录已中断。'],
  'Entrada inválida.': ['Invalid entry.', '输入无效。'],
  'Entrada não confirmada.': ['Sign-in not confirmed.', '登录未确认。'],
  'Entrada no grupo não confirmada.': [
    'Joining the group was not confirmed.',
    '加入群组未确认。',
  ],
  'Entrada pendente inválida.': ['Invalid pending entry.', '待处理条目无效。'],
  Entrar: ['Sign in', '登录'],
  'Entrar em grupo privado': ['Join private group', '加入私密群组'],
  'Entrar mostra o grupo na sua lista de conversas.': [
    'Joining adds the group to your conversation list.',
    '加入后，群组会出现在对话列表中。',
  ],
  'Entrar na conta': ['Sign in to your account', '登录账户'],
  'Entrar no grupo': ['Join group', '加入群组'],
  'Entrar para seguir': ['Sign in to follow', '登录以关注'],
  'Entrar pelo Perfil': ['Sign in through Profile', '通过“个人资料”登录'],
  'Entrar por link': ['Join by link', '通过链接加入'],
  'Entre com a wallet original e autorize ou recupere as chaves deste aparelho.':
    [
      "Sign in with the original wallet and authorize or recover this device's keys.",
      '请使用原钱包登录，并授权或恢复此设备的密钥。',
    ],
  'Entre com a wallet ou use um código de vinculação.': [
    'Sign in with your wallet or use a linking code.',
    '使用钱包或关联码登录。',
  ],
  'Entre e autorize este aparelho para abrir os status.': [
    'Sign in and authorize this device to open statuses.',
    '请登录并授权此设备以打开状态。',
  ],
  'Entre e autorize este aparelho para conversar.': [
    'Sign in and authorize this device to chat.',
    '请登录并授权此设备以聊天。',
  ],
  'Entre e autorize este aparelho para usar grupos privados.': [
    'Sign in and authorize this device to use private groups.',
    '请登录并授权此设备以使用私密群组。',
  ],
  'Entre e autorize este aparelho primeiro.': [
    'Sign in and authorize this device first.',
    '请先登录并授权此设备。',
  ],
  'Entre e autorize este aparelho.': [
    'Sign in and authorize this device.',
    '请登录并授权此设备。',
  ],
  'Entre e conecte-se para abrir os status.': [
    'Sign in and connect to open statuses.',
    '请登录并联网以打开状态。',
  ],
  'Entre e conecte-se para conferir as permissões atuais.': [
    'Sign in and connect to check current permissions.',
    '请登录并联网以检查当前权限。',
  ],
  'Entre e crie seu perfil público em Perfil para participar.': [
    'Sign in and create your public profile in Profile to participate.',
    '请登录并在“个人资料”中创建公开个人资料以参与。',
  ],
  'Entre e sincronize para conferir esta lista.': [
    'Sign in and sync to check this list.',
    '请登录并同步以查看此列表。',
  ],
  'Entre na conta e aguarde a operação atual.': [
    'Sign in and wait for the current operation.',
    '请登录并等待当前操作完成。',
  ],
  'Entre na conta para ver pedidos, convites e publicações.': [
    'Sign in to see requests, invitations and publications.',
    '登录后可查看请求、邀请和发布内容。',
  ],
  'Entre na sua conta para consultar o armazenamento.': [
    'Sign in to your account to check storage.',
    '请登录账户以查看存储空间。',
  ],
  'Entre na sua conta.': ['Sign in to your account.', '请登录账户。'],
  'Entre para ver suas comunidades seguidas.': [
    'Sign in to see the communities you follow.',
    '登录后可查看已关注的社区。',
  ],
  'Entre pela wallet para ver suas mensagens @.': [
    'Sign in with your wallet to view your handle messages.',
    '请使用钱包登录以查看用户名私信。',
  ],
  'Entre pelo Perfil para abrir suas mensagens pelo @.': [
    'Sign in through Profile to open your handle messages.',
    '请通过“个人资料”登录以打开用户名私信。',
  ],
  'Entre pelo Perfil para acessar sua lista': [
    'Sign in through Profile to access your list',
    '通过“个人资料”登录以访问列表',
  ],
  'Entre pelo Perfil para compartilhar': [
    'Sign in through Profile to share',
    '通过“个人资料”登录以分享',
  ],
  'Entre pelo Perfil para criar uma postagem.': [
    'Sign in through Profile to create a post.',
    '请通过“个人资料”登录以创建帖子。',
  ],
  'Entre pelo Perfil para participar': [
    'Sign in through Profile to participate',
    '通过“个人资料”登录以参与',
  ],
  'Entre pelo Perfil para responder': [
    'Sign in through Profile to reply',
    '通过“个人资料”登录以回复',
  ],
  'Entre pelo Perfil para votar': [
    'Sign in through Profile to vote',
    '通过“个人资料”登录以投票',
  ],
  'Entre primeiro.': ['Sign in first.', '请先登录。'],
  'Entrega suspensa: é necessário novo consentimento.': [
    'Delivery suspended: renewed consent is required.',
    '送达已暂停：需要重新同意。',
  ],
  'Envelope cifrado obtido. Informe o segredo para abrir localmente.': [
    'Encrypted envelope received. Enter the secret to open it locally.',
    '已取得加密封装。请输入密钥以在本地打开。',
  ],
  'Enviado em {0}.': ['Sent on {0}.', '发送于 {0}。'],
  'Enviando anexo: parte {0} de {1}. Fechar o app pausa a transferência; o rascunho cifrado permanece.':
    [
      'Uploading attachment: part {0} of {1}. Closing the app pauses the transfer; the encrypted draft is preserved.',
      '正在上传附件：第 {0} 部分，共 {1} 部分。关闭应用会暂停传输；加密草稿会保留。',
    ],
  Enviar: ['Send', '发送'],
  'Enviar autorização para aceite': [
    'Send authorization for acceptance',
    '发送授权以请求接受',
  ],
  'Enviar contestação': ['Submit appeal', '提交申诉'],
  'Enviar denúncia': ['Submit report', '提交举报'],
  'Envie ou remova a prévia de voz antes de bloquear o contato.': [
    'Send or remove the voice preview before blocking the contact.',
    '屏蔽联系人前，请发送或移除语音预览。',
  ],
  'Envie ou remova a prévia de voz antes de trocar de conversa.': [
    'Send or remove the voice preview before changing conversations.',
    '切换对话前，请发送或移除语音预览。',
  ],
  'Envie ou remova a prévia de voz antes de trocar de destinatário.': [
    'Send or remove the voice preview before changing recipients.',
    '更换接收者前，请发送或移除语音预览。',
  ],
  'Envio concluído': ['Upload complete', '上传完成'],
  'Envio de mídia indisponível. Tente novamente.': [
    'Media upload unavailable. Try again.',
    '媒体上传不可用。请重试。',
  ],
  'Envio do grupo não confirmado.': [
    'Group send not confirmed.',
    '群组发送未确认。',
  ],
  'Envio interrompido.': ['Send interrupted.', '发送已中断。'],
  'Enviou uma mídia.': ['Sent media.', '发送了媒体。'],
  'Época das DMs indisponível.': [
    'DM key epoch unavailable.',
    '私信密钥周期不可用。',
  ],
  'Época de chave indisponível.': [
    'Key epoch unavailable.',
    '密钥周期不可用。',
  ],
  'Época de upload inválida.': ['Invalid upload epoch.', '上传周期无效。'],
  Equilibrado: ['Balanced', '均衡'],
  'Escolha a wallet desta conta para concluir a entrada e abrir suas chaves.': [
    "Choose this account's wallet to finish signing in and open your keys.",
    '请选择此账户的钱包，以完成登录并打开密钥。',
  ],
  'Escolha mídia para enviar.': [
    'Choose media to send.',
    '请选择要发送的媒体。',
  ],
  'Escolha no máximo 256 imagens por rodada.': [
    'Choose no more than 256 images per round.',
    '每轮最多选择 256 张图片。',
  ],
  'Escolha outro aparelho autorizado para revogar.': [
    'Choose another authorized device to revoke.',
    '请选择另一台已授权设备以撤销授权。',
  ],
  'Escolha pelo menos uma tag.': [
    'Choose at least one tag.',
    '请至少选择一个标签。',
  ],
  'Escolha um contato aprovado.': [
    'Choose an approved contact.',
    '请选择已批准的联系人。',
  ],
  'Escolha um contato autorizado para enviar o GIF.': [
    'Choose an authorized contact to send the GIF.',
    '请选择已授权联系人以发送 GIF。',
  ],
  'Escolha uma foto para o status.': [
    'Choose a status photo.',
    '请选择状态图片。',
  ],
  'Escolha uma foto PNG, JPEG ou WebP de até 3 MB.': [
    'Choose a PNG, JPEG or WebP photo no larger than 3 MB.',
    '请选择不超过 3 MB 的 PNG、JPEG 或 WebP 图片。',
  ],
  'Escolher emoji': ['Choose emoji', '选择表情'],
  'Escolher entre seguir comunidade ou autor': [
    'Choose whether to follow the community or author',
    '选择关注社区或作者',
  ],
  'Escolher feed': ['Choose feed', '选择动态'],
  'Escolher GIF': ['Choose GIF', '选择 GIF'],
  'Escopo: por exemplo, suporte ao cliente': [
    'Scope: for example, customer support',
    '授权范围：例如客户支持',
  ],
  'Escreva sua resposta…': ['Write your reply…', '写下回复…'],
  'Escreva uma mensagem ou escolha um anexo.': [
    'Write a message or choose an attachment.',
    '请撰写消息或选择附件。',
  ],
  'Escrever a primeira postagem': ['Write the first post', '发布第一篇帖子'],
  Escura: ['Dark', '深色'],
  'Esse status já expirou ou não está nesta página.': [
    'This status has expired or is not on this page.',
    '此状态已过期，或不在此页面中。',
  ],
  'Esta autorização pertence a outra conta.': [
    'This authorization belongs to another account.',
    '此授权属于另一个账户。',
  ],
  'Esta conta ainda usa o código antigo. Recupere ou migre pelo fluxo legado.':
    [
      'This account still uses the old code. Recover or migrate through the legacy flow.',
      '此账户仍使用旧代码。请通过旧版流程恢复或迁移。',
    ],
  'Esta conversa está recusada, bloqueada ou indisponível.': [
    'This conversation is declined, blocked or unavailable.',
    '此对话已被拒绝、屏蔽或不可用。',
  ],
  'Esta foto não coube no avatar. Escolha outra imagem.': [
    'This photo could not fit the avatar. Choose another image.',
    '此图片无法适配头像。请选择其他图片。',
  ],
  'Esta imagem já foi enviada com outra marcação. Use “Corrigir” no caso salvo.':
    [
      'This image was already uploaded with a different annotation. Use “Correct” on the saved case.',
      '此图片已使用其他标注上传。请在已保存的案例中使用“修正”。',
    ],
  'Esta página é restrita à sua conta.': [
    'This page is restricted to your account.',
    '此页面仅限你的账户访问。',
  ],
  'Esta rodada expirou.': ['This round expired.', '本轮已过期。'],
  'Estado da autorização divergente.': [
    'Authorization state does not match.',
    '授权状态不匹配。',
  ],
  'Estado da chamada divergente.': [
    'Call state does not match.',
    '通话状态不匹配。',
  ],
  'Estado da mídia inválido.': ['Invalid media state.', '媒体状态无效。'],
  'Estado de entrega divergente.': [
    'Delivery state does not match.',
    '送达状态不匹配。',
  ],
  'Estado de entrega inválido.': ['Invalid delivery state.', '送达状态无效。'],
  'Estado de mensagem inválido.': ['Invalid message state.', '消息状态无效。'],
  'Estado de transferência inválido.': [
    'Invalid transfer state.',
    '传输状态无效。',
  ],
  'Estado de upload inválido.': ['Invalid upload state.', '上传状态无效。'],
  'Estado de uploads inválido.': ['Invalid uploads state.', '上传状态无效。'],
  'Estado inválido recebido da coleta.': [
    'Invalid state received from collection.',
    '从采集端收到的状态无效。',
  ],
  'Estado sem atualização suficiente.': [
    'State is not sufficiently up to date.',
    '状态更新不足。',
  ],
  'Estados de grupo inválidos.': ['Invalid group states.', '群组状态无效。'],
  'Estados inválidos.': ['Invalid states.', '状态无效。'],
  'Este aparelho já está autorizado.': [
    'This device is already authorized.',
    '此设备已获授权。',
  ],
  'Este arquivo não está mais vinculado a uma postagem disponível. O registro da análise permanece abaixo.':
    [
      'This file is no longer linked to an available post. The analysis record remains below.',
      '此文件已不再关联可用帖子。分析记录仍列于下方。',
    ],
  'Este bloco ainda não está no aparelho. Reconecte para carregar.': [
    'This block is not on the device yet. Reconnect to load it.',
    '此数据块尚不在设备上。请重新联网以加载。',
  ],
  'Este cartão foi encaminhado. Ele não comprova que o remetente é o representante.':
    [
      'This card was forwarded. It does not prove that the sender is the representative.',
      '此卡片经过转发，不能证明发送者就是代表本人。',
    ],
  'Este convite não está mais disponível.': [
    'This invitation is no longer available.',
    '此邀请已不可用。',
  ],
  'Este link de vinculação é inválido. Gere outro QR Code.': [
    'This linking link is invalid. Generate another QR code.',
    '此关联链接无效。请生成新的二维码。',
  ],
  'Este navegador não oferece a exclusão entre abas necessária. Use um navegador atualizado.':
    [
      'This browser lacks the required cross-tab locking. Use an updated browser.',
      '此浏览器不支持所需的标签页间互斥机制。请使用新版浏览器。',
    ],
  'Este navegador não oferece Web Push. No iPhone/iPad, adicione à tela inicial e abra pelo ícone.':
    [
      'This browser does not support Web Push. On iPhone/iPad, add the app to the home screen and open its icon.',
      '此浏览器不支持网页推送。请在 iPhone/iPad 上将应用添加到主屏幕，并通过图标打开。',
    ],
  'Este navegador não permite chamadas de voz. Abra em HTTPS e permita o microfone.':
    [
      'This browser cannot make voice calls. Open over HTTPS and allow microphone access.',
      '此浏览器无法进行语音通话。请通过 HTTPS 打开并允许麦克风权限。',
    ],
  'Este navegador não permite ler o tema salvo. Usando Preto nesta abertura.': [
    'This browser cannot read the saved theme. Using Black for this visit.',
    '此浏览器无法读取已保存主题。本次使用黑色主题。',
  ],
  'Este QR Code não contém um convite do 0xDMme.': [
    'This QR code does not contain a 0xDMme invitation.',
    '此二维码不包含 0xDMme 邀请。',
  ],
  'Este QR Code não corresponde à etapa de vinculação.': [
    'This QR code does not match the device linking step.',
    '此二维码与设备关联步骤不匹配。',
  ],
  'Este registro usa uma versão anterior da política. A revisão considera as regras públicas atuais.':
    [
      'This record uses an earlier policy version. The review follows the current public rules.',
      '此记录使用旧版政策。复核将按照现行公开规则进行。',
    ],
  'Este status expirou.': ['This status expired.', '此状态已过期。'],
  'Este usuário está bloqueado. Suas publicações e respostas ficam ocultas para você.':
    [
      'This user is blocked. Their posts and replies are hidden from you.',
      '此用户已被屏蔽。其帖子和回复对你隐藏。',
    ],
  'Estimativa de navegadores únicos por post, incluindo visitantes sem login.':
    [
      'Estimated unique browsers per post, including visitors who are not signed in.',
      '每篇帖子的独立浏览器估算数，包括未登录访客。',
    ],
  'Evento de outro grupo.': [
    'Event belongs to another group.',
    '事件属于另一个群组。',
  ],
  Excluir: ['Delete', '删除'],
  'Excluir a definição deste badge quando não houver atribuições': [
    'Delete this badge definition when it has no assignments',
    '在没有分配记录时删除此徽章定义',
  ],
  'Excluir badge': ['Delete badge', '删除徽章'],
  'Excluir este status?': ['Delete this status?', '删除此状态？'],
  'Excluir minha postagem': ['Delete my post', '删除我的帖子'],
  'Excluir o grupo e iniciar a remoção do cofre remoto para todos? Cópias já conservadas pelos participantes continuam sob controle deles.':
    [
      'Delete the group and start removing the remote vault for everyone? Copies already kept by participants remain under their control.',
      '删除群组并开始为所有成员移除远程保险库？成员已保留的副本仍由他们控制。',
    ],
  'Excluir postagem': ['Delete post', '删除帖子'],
  'Excluir texto e mídia do banco/armazenamento ativo. Cópias externas e backups podem permanecer.':
    [
      'Delete text and media from active database/storage. External copies and backups may remain.',
      '从活动数据库和存储中删除文字及媒体。外部副本和备份可能仍然存在。',
    ],
  'Exclusão divergente da mensagem já autenticada.': [
    'Deletion differs from the already authenticated message.',
    '删除内容与已验证的消息不一致。',
  ],
  'Exclusão não autenticada.': [
    'Unauthenticated deletion.',
    '删除未经身份验证。',
  ],
  'Expiração de status inválida.': [
    'Invalid status expiration.',
    '状态到期时间无效。',
  ],
  Expirada: ['Expired', '已过期'],
  'Explique por que este arquivo atende às regras públicas': [
    'Explain why this file follows the public rules',
    '说明此文件为何符合公开规则',
  ],
  Exportação: ['Export', '导出'],
  'Exportação inválida.': ['Invalid export.', '导出无效。'],
  'Exportação solicitada. O arquivo baixado contém as imagens e fica sob seu controle.':
    [
      'Export requested. The downloaded file contains the images and is under your control.',
      '已请求导出。下载的文件包含图片，由你自行控制。',
    ],
  'Extremo da chamada ausente.': ['Call endpoint missing.', '缺少通话端点。'],
  'Extremos da chamada divergentes.': [
    'Call endpoints do not match.',
    '通话端点不匹配。',
  ],
  'Falha ao encerrar transação local.': [
    'Failed to end the local transaction.',
    '无法结束本地事务。',
  ],
  'Falha de backup inválida.': [
    'Invalid backup failure.',
    '备份失败信息无效。',
  ],
  'Falha na {0} ({1}). Confira as chaves e a sessão; nenhum envio em texto aberto será feito.':
    [
      'Failure in {0} ({1}). Check the keys and session; no plaintext will be sent.',
      '{0} 失败（{1}）。请检查密钥和会话；不会以明文发送。',
    ],
  'Falha na comunicação com o serviço.': [
    'Failed to communicate with the service.',
    '与服务通信失败。',
  ],
  'Favorito inválido.': ['Invalid favorite.', '收藏项无效。'],
  Fechar: ['Close', '关闭'],
  'Fechar áudio': ['Close audio', '关闭音频'],
  'Fechar aviso': ['Close notice', '关闭提示'],
  'Fechar original': ['Close original', '关闭原图'],
  Feed: ['Feed', '动态'],
  'Feed de seguidos': ['Following feed', '关注动态'],
  'Feed indisponível.': ['Feed unavailable.', '动态不可用。'],
  'Filtrar atividade': ['Filter activity', '筛选活动'],
  'Filtrar por tag': ['Filter by tag', '按标签筛选'],
  Fixar: ['Pin', '置顶'],
  'Formato da mídia pública inválido.': [
    'Invalid public media format.',
    '公开媒体格式无效。',
  ],
  'Formato de backup não suportado.': [
    'Unsupported backup format.',
    '不支持此备份格式。',
  ],
  'Formato do ensaio inválido.': ['Invalid test format.', '测试格式无效。'],
  Foto: ['Photo', '图片'],
  'Foto ainda não preservada.': ['Photo not yet preserved.', '图片尚未保留。'],
  'Foto da comunidade': ['Community photo', '社区图片'],
  'Foto de origem deve ter até 20 MB para processamento local.': [
    'The source photo must be no larger than 20 MB for local processing.',
    '用于本地处理的原始图片不得超过 20 MB。',
  ],
  'Foto de perfil inválida.': ['Invalid profile photo.', '个人资料图片无效。'],
  'Foto deve ter até 3 MB.': [
    'The photo must be no larger than 3 MB.',
    '图片不得超过 3 MB。',
  ],
  'Foto do grupo': ['Group photo', '群组图片'],
  'Foto do grupo indisponível neste aparelho.': [
    'Group photo unavailable on this device.',
    '此设备上的群组图片不可用。',
  ],
  'Foto do perfil': ['Profile photo', '个人资料图片'],
  'Foto do status': ['Status photo', '状态图片'],
  'Foto incompleta ou adulterada.': [
    'Photo incomplete or tampered with.',
    '图片不完整或遭到篡改。',
  ],
  'Foto indisponível.': ['Photo unavailable.', '图片不可用。'],
  'Foto inválida.': ['Invalid photo.', '图片无效。'],
  'Foto não confirmada. Tente novamente.': [
    'Photo not confirmed. Try again.',
    '图片未确认。请重试。',
  ],
  'Não foi possível salvar a foto. Selecione-a novamente para tentar.': [
    'Could not save the photo. Select it again to retry.',
    '无法保存照片。请重新选择照片后重试。',
  ],
  'Foto privada indisponível neste aparelho.': [
    'Private photo unavailable on this device.',
    '此设备上的私密图片不可用。',
  ],
  'Foto pública aprovada': ['Approved public photo', '已批准公开的图片'],
  'Foto pública indisponível.': [
    'Public photo unavailable.',
    '公开图片不可用。',
  ],
  'Foto/arquivo': ['Photo/file', '图片/文件'],
  'Frequência do microfone não suportada.': [
    'Unsupported microphone sample rate.',
    '不支持此麦克风采样率。',
  ],
  'Função e escopo': ['Role and scope', '角色与授权范围'],
  'Fundo claro': ['Light background', '浅色背景'],
  'Galeria indisponível.': ['Gallery unavailable.', '图库不可用。'],
  Geral: ['General', '常规'],
  'Gerando prova com identidade fictícia e artefatos locais…': [
    'Generating proof with a fictional identity and local artifacts…',
    '正在使用虚构身份和本地文件生成证明…',
  ],
  'Gerar e assinar código': ['Generate and sign code', '生成并签署代码'],
  'Gerenciar comunidade': ['Manage community', '管理社区'],
  'GIF deve ter até 3 MB.': [
    'The GIF must be no larger than 3 MB.',
    'GIF 不得超过 3 MB。',
  ],
  'GIF indisponível agora.': ['GIF currently unavailable.', 'GIF 暂时不可用。'],
  'GIF inválido.': ['Invalid GIF.', 'GIF 无效。'],
  'GIF público aprovado': ['Approved public GIF', '已批准公开的 GIF'],
  'GIF: {0}': ['GIF: {0}', 'GIF：{0}'],
  'GIFs do KLIPY': ['GIFs from KLIPY', '来自 KLIPY 的 GIF'],
  'GIFs e vídeos externos conectam você aos provedores, que recebem seu IP e podem coletar buscas, dados do navegador, cookies e dados de reprodução. A criptografia das conversas permanece; o app não envia sua wallet, chaves ou histórico de conversas a eles.':
    [
      'GIFs and external videos connect you to providers, who receive your IP and may collect searches, browser data, cookies and playback data. Conversations remain encrypted; the app does not send them your wallet, keys or conversation history.',
      'GIF 和外部视频会连接到服务提供商，他们会接收你的 IP，并可能收集搜索内容、浏览器数据、Cookie 及播放数据。对话仍保持加密；应用不会向他们发送钱包信息、密钥或对话历史。',
    ],
  'GIFs indisponíveis neste servidor.': [
    'GIFs unavailable on this server.',
    '此服务器上的 GIF 不可用。',
  ],
  'GIFs indisponíveis.': ['GIFs unavailable.', 'GIF 不可用。'],
  'Gravação cancelada. Nenhum áudio enviado.': [
    'Recording cancelled. No audio sent.',
    '录音已取消。未发送任何音频。',
  ],
  'Gravação concluída; confira a prévia antes de enviar.': [
    'Recording complete; check the preview before sending.',
    '录音已完成；发送前请检查预览。',
  ],
  'Gravação de mensagens não confirmada no aparelho.': [
    'Message storage on the device was not confirmed.',
    '设备上的消息保存未确认。',
  ],
  'Gravação de parte não confirmada.': [
    'Part storage not confirmed.',
    '分片保存未确认。',
  ],
  'Gravação de voz indisponível neste navegador. Use uma versão atual em HTTPS.':
    [
      'Voice recording unavailable in this browser. Use an updated browser over HTTPS.',
      '此浏览器无法录制语音。请通过 HTTPS 使用新版浏览器。',
    ],
  'Gravação não iniciada: {0}': [
    'Recording not started: {0}',
    '录音未开始：{0}',
  ],
  'Gravação não iniciada. Confira a permissão do microfone.': [
    'Recording not started. Check microphone permission.',
    '录音未开始。请检查麦克风权限。',
  ],
  'Gravação vazia ou acima de 90 segundos.': [
    'Recording empty or longer than 90 seconds.',
    '录音为空或超过 90 秒。',
  ],
  'Gravando. Até 90 segundos.': [
    'Recording. Up to 90 seconds.',
    '正在录音。最长 90 秒。',
  ],
  'group-media:{0} indisponível': [
    'group-media:{0} unavailable',
    'group-media:{0} 不可用',
  ],
  'group-message:{0} indisponível': [
    'group-message:{0} unavailable',
    'group-message:{0} 不可用',
  ],
  'Grupo {0}': ['Group {0}', '群组 {0}'],
  'Grupo aberto.': ['Group opened.', '群组已打开。'],
  'Grupo criado. Nome ou sincronização pendente: {0}': [
    'Group created. Name or sync pending: {0}',
    '群组已创建。名称或同步待完成：{0}',
  ],
  'Grupo da busca mudou. Inicie novamente.': [
    'Search group changed. Start again.',
    '搜索中的群组已更改。请重新开始。',
  ],
  'Grupo histórico inválido.': ['Invalid historical group.', '历史群组无效。'],
  'Grupo sem origem.': ['Group has no origin.', '群组缺少来源。'],
  'Grupo sem participação atual ou conteúdo.': [
    'Group has no current membership or content.',
    '群组缺少当前成员身份或内容。',
  ],
  'Grupo sintético incompleto.': [
    'Synthetic group incomplete.',
    '模拟群组不完整。',
  ],
  'Guardar denúncia': ['Save report', '保存举报'],
  'há {0} d': ['{0} d ago', '{0} 天前'],
  'há {0} h': ['{0} h ago', '{0} 小时前'],
  'há {0} min': ['{0} min ago', '{0} 分钟前'],
  'Há conflitos de convites. Revogue o link e resolva as versões no cofre.': [
    'Invitation conflicts found. Revoke the link and resolve versions in the vault.',
    '发现邀请冲突。请撤销链接并解决保险库中的版本冲突。',
  ],
  'Há escolhas diferentes em seus aparelhos. As exclusões foram reunidas; confira e salve a lista para resolver.':
    [
      'Your devices have different choices. Deletions were combined; check and save the list to resolve.',
      '设备间的选项不一致。删除记录已合并；请检查并保存列表以解决冲突。',
    ],
  'Há mais histórico para consultar. Continue a busca.': [
    'More history is available. Continue searching.',
    '还有更多历史可查询。请继续搜索。',
  ],
  'Há mídia pendente. Envie ou cancele antes de escolher outra.': [
    'Media pending. Send or cancel it before choosing more.',
    '有待发送媒体。请选择更多媒体前先发送或取消。',
  ],
  'Há um envio pendente com outro texto. Retome o texto original antes de enviar uma alteração.':
    [
      'A send is pending with different text. Resume the original text before sending a change.',
      '有包含不同文字的待发送内容。发送更改前，请先恢复原始文字。',
    ],
  'Há um rascunho cifrado. Retome ou descarte primeiro.': [
    'An encrypted draft exists. Resume or discard it first.',
    '已有加密草稿。请先恢复或丢弃。',
  ],
  'Há uma abertura de conta pendente na wallet. Em Perfil → Aparelhos, conclua ou cancele o pedido antes de atualizar.':
    [
      'Account opening is pending in your wallet. In Profile → Devices, complete or cancel the request before updating.',
      '钱包中有待完成的账户打开请求。更新前，请在“个人资料 → 设备”中完成或取消请求。',
    ],
  'Hash da imagem divergente do caso.': [
    'Image hash differs from the case.',
    '图片哈希与案例不一致。',
  ],
  'Hash-Talk · {0}': ['0xDMme · {0}', '0xDMme · {0}'],
  'Histórico antigo do grupo.': ['Old group history.', '群组历史已过时。'],
  'Histórico com identificadores repetidos.': [
    'History contains duplicate identifiers.',
    '历史包含重复标识。',
  ],
  'Histórico da identidade de DM inválido.': [
    'Invalid DM identity history.',
    '私信身份历史无效。',
  ],
  'Histórico de DM diverge da cópia autenticada.': [
    'DM history differs from the authenticated copy.',
    '私信历史与已验证副本不一致。',
  ],
  'Histórico de DM no aparelho': [
    'DM history on this device',
    '此设备上的私信历史',
  ],
  'Histórico de DMs excede o orçamento de registros do backup.': [
    'DM history exceeds the backup record budget.',
    '私信历史超过备份记录预算。',
  ],
  'Histórico de grupo inválido.': ['Invalid group history.', '群组历史无效。'],
  'Histórico de identidade de DM incompleto.': [
    'DM identity history incomplete.',
    '私信身份历史不完整。',
  ],
  'Histórico diverge da cópia remota.': [
    'History differs from the remote copy.',
    '历史与远程副本不一致。',
  ],
  'Histórico do grupo divergente.': [
    'Group history does not match.',
    '群组历史不匹配。',
  ],
  'Histórico do grupo incompleto.': [
    'Group history incomplete.',
    '群组历史不完整。',
  ],
  'Histórico em formação; crescimento ainda não comparável.': [
    'History is still forming; growth cannot yet be compared.',
    '历史数据仍在积累，增长尚不可比较。',
  ],
  'Histórico excede o limite do ensaio.': [
    'History exceeds the test limit.',
    '历史超过测试限制。',
  ],
  'Histórico local': ['Local history', '本地历史'],
  'Histórico local de grupo inválido.': [
    'Invalid local group history.',
    '群组本地历史无效。',
  ],
  'Histórico local de outro grupo.': [
    'Local history belongs to another group.',
    '本地历史属于另一个群组。',
  ],
  'Histórico local indisponível.': [
    'Local history unavailable.',
    '本地历史不可用。',
  ],
  'Histórico local não autorizado.': [
    'Local history not authorized.',
    '本地历史未获授权。',
  ],
  'Histórico local não gravado. Confira o espaço disponível no aparelho; o arquivo de backup continua independente.':
    [
      'Local history was not saved. Check available device space; the backup file remains independent.',
      '本地历史未保存。请检查设备可用空间；备份文件仍为独立副本。',
    ],
  'Histórico público de outro contexto.': [
    'Public history belongs to another context.',
    '公开历史属于其他上下文。',
  ],
  'Histórico recuperado localmente em {0} ms (revisão {1}). Nenhuma sessão ou permissão de aparelho foi restaurada.':
    [
      'History recovered locally in {0} ms (revision {1}). No session or device permission was restored.',
      '历史已在本地恢复，耗时 {0} 毫秒（修订版本 {1}）。未恢复任何会话或设备权限。',
    ],
  'HTTP {0}': ['HTTP {0}', 'HTTP {0}'],
  'Identidade criada em outra aba.': [
    'Identity created in another tab.',
    '身份已在另一个标签页创建。',
  ],
  'Identidade da chamada mudou.': [
    'Call identity changed.',
    '通话身份已更改。',
  ],
  'Identidade da mensagem divergente do índice.': [
    'Message identity differs from the index.',
    '消息身份与索引不一致。',
  ],
  'Identidade do contato ausente.': [
    'Contact identity missing.',
    '缺少联系人身份。',
  ],
  'Identidade do contato divergente.': [
    'Contact identity does not match.',
    '联系人身份不匹配。',
  ],
  'Identidade do contato mudou. Confira com ele antes de continuar.': [
    "The contact's identity changed. Check with them before continuing.",
    '联系人身份已更改。请先与对方核对再继续。',
  ],
  'Identidade do destinatário ausente.': [
    'Recipient identity missing.',
    '缺少接收者身份。',
  ],
  'Identidade histórica das DMs diverge da cópia confiável.': [
    'Historical DM identity differs from the trusted copy.',
    '历史私信身份与可信副本不一致。',
  ],
  'Identidade inicial ausente.': [
    'Initial identity missing.',
    '缺少初始身份。',
  ],
  'Identidade inválida.': ['Invalid identity.', '身份无效。'],
  'Identidade local alterada.': ['Local identity changed.', '本地身份已更改。'],
  'Identidade local ausente.': ['Local identity missing.', '缺少本地身份。'],
  'Identidade Matrix de origem ausente.': [
    'Source Matrix identity missing.',
    '缺少来源 Matrix 身份。',
  ],
  'Identidade Matrix não preparada.': [
    'Matrix identity not prepared.',
    'Matrix 身份尚未准备好。',
  ],
  'Identidades fixadas em conflito.': [
    'Pinned identities conflict.',
    '固定身份存在冲突。',
  ],
  'Identificador confirmado com conteúdo divergente. Rascunho preservado.': [
    'Identifier confirmed with different content. Draft preserved.',
    '标识已确认，但内容不一致。草稿已保留。',
  ],
  'Identificador de análise inválido.': [
    'Invalid analysis identifier.',
    '分析标识无效。',
  ],
  'Imagem {0} salva: {1}.': ['Image {0} saved: {1}.', '图片 {0} 已保存：{1}。'],
  'Imagem ampliada': ['Enlarged image', '放大的图片'],
  'Imagem divergente do caso.': [
    'Image differs from the case.',
    '图片与案例不一致。',
  ],
  'Imagem excede o orçamento do leitor.': [
    "Image exceeds the reader's budget.",
    '图片超过读取器预算。',
  ],
  'Imagem indisponível.': ['Image unavailable.', '图片不可用。'],
  'Imagem indisponível. Conecte ou toque para tentar novamente.': [
    'Image unavailable. Connect or tap to try again.',
    '图片不可用。请联网或点击重试。',
  ],
  'Imagem inválida.': ['Invalid image.', '图片无效。'],
  'Imagem original do caso {0}': [
    'Original image for case {0}',
    '案例 {0} 的原始图片',
  ],
  'Imagens e resultados da rodada apagados do avaliador.': [
    'Round images and results deleted from the evaluator.',
    '本轮图片和结果已从评估器中删除。',
  ],
  'Importe ou crie um pacote fictício primeiro.': [
    'Import or create a fictional package first.',
    '请先导入或创建虚构数据包。',
  ],
  'Incerto / revisar': ['Uncertain / review', '不确定 / 复核'],
  'Indicação de conteúdo explícito': [
    'Explicit content detected',
    '检测到露骨内容',
  ],
  'Índice de mensagens inválido.': ['Invalid message index.', '消息索引无效。'],
  'Índice de mensagens parcialmente conferido. Continue sincronizando; o histórico permanece oculto.':
    [
      'Message index partially verified. Continue syncing; history remains hidden.',
      '消息索引已部分核验。请继续同步；历史仍保持隐藏。',
    ],
  'Índice histórico divergente do conteúdo cifrado.': [
    'Historical index differs from encrypted content.',
    '历史索引与加密内容不一致。',
  ],
  'Índice histórico não autenticado.': [
    'Historical index not authenticated.',
    '历史索引未经验证。',
  ],
  'Índice local de outro grupo.': [
    'Local index belongs to another group.',
    '本地索引属于另一个群组。',
  ],
  'Índice local parcialmente carregado. Continue abrindo a cópia local.': [
    'Local index partially loaded. Continue opening the local copy.',
    '本地索引已部分加载。请继续打开本地副本。',
  ],
  indisponível: ['unavailable', '不可用'],
  'Informação criptográfica ausente.': [
    'Cryptographic information missing.',
    '缺少加密信息。',
  ],
  'Informe um convite válido.': [
    'Enter a valid invitation.',
    '请输入有效邀请。',
  ],
  'Informe uma última vez o código antigo para autorizar a migração.': [
    'Enter the old code one last time to authorize migration.',
    '请最后一次输入旧代码，以授权迁移。',
  ],
  'inicialização do motor criptográfico': [
    'cryptographic engine initialization',
    '加密引擎初始化',
  ],
  'Instalação e modo offline exigem navegador compatível e HTTPS ou loopback.':
    [
      'Installation and offline mode require a compatible browser and HTTPS or loopback.',
      '安装和离线模式需要兼容浏览器，以及 HTTPS 或回环地址。',
    ],
  'Interface ausente.': ['Interface missing.', '缺少界面。'],
  'Interface do ensaio ausente.': ['Test interface missing.', '缺少测试界面。'],
  'Interface incompleta.': ['Interface incomplete.', '界面不完整。'],
  'Interface offline indisponível. Tente novamente com conexão.': [
    'Offline interface unavailable. Try again with a connection.',
    '离线界面不可用。请联网后重试。',
  ],
  'Esta página já usa a versão mais recente.': [
    'This page already runs the latest version.',
    '此页面已在使用最新版本。',
  ],
  'Interface pública instalada para uso offline.': [
    'Public interface installed for offline use.',
    '公开界面已安装，可离线使用。',
  ],
  'Item corrompido.': ['Corrupted item.', '项目已损坏。'],
  'Item de backup ausente.': ['Backup item missing.', '缺少备份项目。'],
  'Item divergente do relatório.': [
    'Item differs from the report.',
    '项目与报告不一致。',
  ],
  'Item excedido.': ['Item exceeds the limit.', '项目超过限制。'],
  'Já existe uma solicitação de conexão pendente na wallet.': [
    'A connection request is already pending in your wallet.',
    '钱包中已有待处理连接请求。',
  ],
  'Janela verificada excedida.': [
    'Verified window exceeds the limit.',
    '已验证窗口超过限制。',
  ],
  'JPEG gerado incompleto.': [
    'Generated JPEG incomplete.',
    '生成的 JPEG 不完整。',
  ],
  'JPEG gerado inválido.': ['Generated JPEG invalid.', '生成的 JPEG 无效。'],
  'Leitor indisponível.': ['Reader unavailable.', '读取器不可用。'],
  'Leitura de menção indisponível.': [
    'Mention read unavailable.',
    '提及读取不可用。',
  ],
  'Leitura encerrada após um minuto. Tente novamente.': [
    'Reading stopped after one minute. Try again.',
    '读取已在一分钟后停止。请重试。',
  ],
  'Leitura pública · participação com conta': [
    'Public reading · account required to participate',
    '公开阅读 · 参与需要账户',
  ],
  'Leitura pública cancelada.': [
    'Public reading cancelled.',
    '公开读取已取消。',
  ],
  'Leitura pública indisponível.': [
    'Public reading unavailable.',
    '公开读取不可用。',
  ],
  'Leituras públicas ocupadas.': ['Public readers busy.', '公开读取服务繁忙。'],
  'Lendo e validando o arquivo escolhido.': [
    'Reading and validating the selected file.',
    '正在读取并验证所选文件。',
  ],
  'Lida pelo destinatário': ['Read by recipient', '接收者已读'],
  'Limite de 45 segundos atingido; workers encerrados. Registrar este resultado no teste do aparelho.':
    [
      '45-second limit reached; workers stopped. Record this result in the device test.',
      '已达到 45 秒上限；工作线程已停止。请在设备测试中记录此结果。',
    ],
  'Limite de 90 segundos atingido. Confira a prévia antes de enviar.': [
    '90-second limit reached. Check the preview before sending.',
    '已达到 90 秒上限。发送前请检查预览。',
  ],
  'Limite de gravação atingido. Confira o trecho preservado.': [
    'Recording limit reached. Check the preserved excerpt.',
    '已达到录音上限。请检查保留的片段。',
  ],
  'Limite de pacotes de chave do ensaio.': [
    'Test key package limit reached.',
    '已达到测试密钥包上限。',
  ],
  Limpar: ['Clear', '清除'],
  'Limpar o conteúdo do cofre remoto deste grupo? Mensagens e mídias serão removidas; cópias locais e arquivos já salvos podem permanecer.':
    [
      "Clear this group's remote vault content? Messages and media will be removed; local copies and saved files may remain.",
      '清理此群组的远程保险库内容？消息和媒体将被移除；本地副本及已保存文件可能仍然保留。',
    ],
  'Limpeza de mídias antigas prevista para {0}. Cerca de {1} MB selecionados. Textos permanecem.':
    [
      'Old media cleanup scheduled for {0}. About {1} MB selected. Text stays.',
      '旧媒体计划于 {0} 清理。已选择约 {1} MB。文字会保留。',
    ],
  'Limpeza do arquivo temporário de backup pendente.': [
    'Temporary backup file cleanup pending.',
    '临时备份文件清理待完成。',
  ],
  'Limpeza do cofre iniciada.': [
    'Vault cleanup started.',
    '保险库清理已开始。',
  ],
  'Link copiado.': ['Link copied.', '链接已复制。'],
  'Link copiado. Compartilhe manualmente com o destinatário.': [
    'Link copied. Share it manually with the recipient.',
    '链接已复制。请手动分享给接收者。',
  ],
  'Link de comunidade inválido.': ['Invalid community link.', '社区链接无效。'],
  'Link não confirmado.': ['Link not confirmed.', '链接未确认。'],
  'Link particular de convite': ['Private invitation link', '私密邀请链接'],
  'Link pronto. Copie o endereço acima.': [
    'Link ready. Copy the address above.',
    '链接已准备好。请复制上方地址。',
  ],
  'Link revogado. Quem já entrou continua no grupo.': [
    'Link revoked. Existing members remain in the group.',
    '链接已撤销。已加入的成员仍在群组中。',
  ],
  'Lista de contatos inválida.': ['Invalid contact list.', '联系人列表无效。'],
  'Lista de grupos inválida.': ['Invalid group list.', '群组列表无效。'],
  'Lista de status inválida.': ['Invalid status list.', '状态列表无效。'],
  'Lista indisponível.': ['List unavailable.', '列表不可用。'],
  'Listas de seguidores': ['Follower lists', '关注者列表'],
  'Listas e gestão de comunidades': [
    'Community lists and management',
    '社区列表与管理',
  ],
  'Login por wallet ou vinculação': [
    'Sign in with wallet or device linking',
    '通过钱包或设备关联登录',
  ],
  'Lote de backup excedido.': [
    'Backup batch exceeds the limit.',
    '备份批次超过限制。',
  ],
  'Lote de backup inválido.': ['Invalid backup batch.', '备份批次无效。'],
  Maiores: ['Largest', '最大社区'],
  'Mais autorizações': ['More authorizations', '更多授权'],
  'Mais comentados': ['Most discussed', '最多评论'],
  'Mais comunidades': ['More communities', '更多社区'],
  'Mais contatos': ['More contacts', '更多联系人'],
  'Mais conversas': ['More conversations', '更多对话'],
  'Mais cópias locais': ['More local copies', '更多本地副本'],
  'Mais filtros': ['More filters', '更多筛选'],
  'Mais moderadores': ['More moderators', '更多管理员'],
  'Mais opções': ['More options', '更多选项'],
  'Mais opções da postagem': ['More post options', '更多帖子选项'],
  'Mais organizações e autorizações': [
    'More organizations and authorizations',
    '更多组织与授权',
  ],
  'Mais tags': ['More tags', '更多标签'],
  'Mais votados': ['Top voted', '最高票'],
  'Manifesto de outra conta.': [
    'Manifest belongs to another account.',
    '清单属于另一个账户。',
  ],
  'Manifesto inconsistente.': ['Inconsistent manifest.', '清单不一致。'],
  'Manifesto referencia autoridade desconhecida.': [
    'Manifest references an unknown authority.',
    '清单引用了未知授权方。',
  ],
  'Manter remoção e responder': [
    'Keep removal and respond',
    '保留移除决定并回复',
  ],
  'Manter sanção e responder': ['Keep sanction and respond', '保留处罚并回复'],
  'Manter somente links': ['Keep links only', '仅保留链接'],
  'Marcação corrigida.': ['Annotation corrected.', '标注已修正。'],
  'Marcação inválida recebida da coleta.': [
    'Invalid annotation received from collection.',
    '从采集端收到的标注无效。',
  ],
  'Marque cada imagem. Cada clique salva o original e avança.': [
    'Annotate each image. Each click saves the original and advances.',
    '请逐张标注图片。每次点击都会保存原始文件并继续下一张。',
  ],
  'Marque pelo menos uma imagem antes de concluir.': [
    'Annotate at least one image before finishing.',
    '完成前请至少标注一张图片。',
  ],
  Média: ['Medium', '中等'],
  'Média clara': ['Medium light', '中浅色'],
  'Média escura': ['Medium dark', '中深色'],
  'media:{0} {1}': ['media:{0} {1}', 'media:{0} {1}'],
  Membro: ['Member', '成员'],
  'Membro {0}': ['Member {0}', '成员 {0}'],
  Menções: ['Mentions', '提及'],
  'Menções a você': ['Mentions of you', '提及你的内容'],
  Mensagem: ['Message', '消息'],
  'Mensagem {0} · {1} MB': ['Message {0} · {1} MB', '消息 {0} · {1} MB'],
  'Mensagem ausente.': ['Message missing.', '缺少消息。'],
  'Mensagem de DM adulterada ou de outro contexto.': [
    'DM tampered with or from another context.',
    '私信遭到篡改或属于其他上下文。',
  ],
  'Mensagem de voz · {0}': ['Voice message · {0}', '语音消息 · {0}'],
  'Mensagem de voz em reprodução': [
    'Voice message playing',
    '正在播放语音消息',
  ],
  'Mensagem diverge do histórico validado.': [
    'Message differs from validated history.',
    '消息与已验证历史不一致。',
  ],
  'Mensagem divergente do índice de grupo.': [
    'Message differs from group index.',
    '消息与群组索引不一致。',
  ],
  'Mensagem divergente do índice.': [
    'Message differs from index.',
    '消息与索引不一致。',
  ],
  'Mensagem do grupo mudou.': ['Group message changed.', '群组消息已更改。'],
  'Mensagem enviada por você': ['Message sent by you', '你发送的消息'],
  'Mensagem enviada.': ['Message sent.', '消息已发送。'],
  'Mensagem fora da conta autorizada.': [
    'Message outside the authorized account.',
    '消息不属于已授权账户。',
  ],
  'Mensagem fora do seu período de participação.': [
    'Message outside your membership period.',
    '消息不在你的成员有效期内。',
  ],
  'Mensagem histórica de grupo inválida.': [
    'Invalid historical group message.',
    '群组历史消息无效。',
  ],
  'Mensagem histórica de outra DM.': [
    'Historical message belongs to another DM.',
    '历史消息属于另一条私信。',
  ],
  'Mensagem histórica inválida.': [
    'Invalid historical message.',
    '历史消息无效。',
  ],
  'Mensagem indisponível sob a autorização atual.': [
    'Message unavailable under current authorization.',
    '当前授权无法访问此消息。',
  ],
  'Mensagem indisponível.': ['Message unavailable.', '消息不可用。'],
  'Mensagem pública pelo @': ['Message via @', '通过 @ 发送消息'],
  'Mensagem recebida de {0}': ['Message received from {0}', '来自 {0} 的消息'],
  'Mensagem recebida de @{0}': [
    'Message received from @{0}',
    '来自 @{0} 的消息',
  ],
  'Mensagem rejeitada: chave, autoria ou integridade inválida.': [
    'Message rejected: invalid key, authorship or integrity.',
    '消息被拒绝：密钥、作者身份或完整性无效。',
  ],
  'Mensagem sem mídia.': ['Message has no media.', '消息不含媒体。'],
  'Mensagem sem participação ou origem verificada.': [
    'Message has no verified membership or origin.',
    '消息缺少已验证的成员身份或来源。',
  ],
  'Mensagem sem recuperação para sua conta.': [
    'Message has no recovery for your account.',
    '消息缺少适用于你账户的恢复信息。',
  ],
  'Mensagens @': ['Handle messages', '用户名私信'],
  'Mensagens abertas. Cofre pessoal cheio: a leitura não pôde ser registrada.':
    [
      'Messages opened. Personal vault full: the read could not be recorded.',
      '消息已打开。个人保险库已满：无法记录已读状态。',
    ],
  'Mensagens de grupo inválidas.': [
    'Invalid group messages.',
    '群组消息无效。',
  ],
  'Mensagens pelo @': ['Handle messages', '用户名私信'],
  'Metadados de grupo adulterados.': [
    'Group metadata tampered with.',
    '群组元数据遭到篡改。',
  ],
  'Meu aparelho': ['My device', '我的设备'],
  'Meus posts': ['My posts', '我的帖子'],
  'Microfone encerrado.': ['Microphone stopped.', '麦克风已关闭。'],
  'Microfone não autorizado.': [
    'Microphone not authorized.',
    '麦克风未获授权。',
  ],
  'Mídia aguardando liberação.': ['Media awaiting approval.', '媒体等待批准。'],
  'Mídia ausente na cópia local.': [
    'Media missing from the local copy.',
    '本地副本中缺少媒体。',
  ],
  'Mídia de backup adulterada.': [
    'Backup media tampered with.',
    '备份媒体遭到篡改。',
  ],
  'Mídia de DM histórica inválida.': [
    'Invalid historical DM media.',
    '历史私信媒体无效。',
  ],
  'Mídia de DM não declarada.': ['DM media not declared.', '未声明私信媒体。'],
  'Mídia de DM vazia.': ['Empty DM media.', '私信媒体为空。'],
  'Mídia de grupo inválida.': ['Invalid group media.', '群组媒体无效。'],
  'Mídia de post ou resposta': ['Post or reply media', '帖子或回复媒体'],
  'Mídia de status divergente.': [
    'Status media does not match.',
    '状态媒体不匹配。',
  ],
  'Mídia externa indisponível.': [
    'External media unavailable.',
    '外部媒体不可用。',
  ],
  'Mídia externa mantida como link. Altere a permissão no Perfil.': [
    'External media kept as a link. Change permission in Profile.',
    '外部媒体仅保留为链接。可在“个人资料”中更改权限。',
  ],
  'Mídia histórica adulterada.': [
    'Historical media tampered with.',
    '历史媒体遭到篡改。',
  ],
  'Mídia histórica divergente.': [
    'Historical media does not match.',
    '历史媒体不匹配。',
  ],
  'Mídia histórica inválida.': ['Invalid historical media.', '历史媒体无效。'],
  'Mídia importada de outra DM.': [
    'Imported media belongs to another DM.',
    '导入的媒体属于另一条私信。',
  ],
  'Mídia incompleta.': ['Media incomplete.', '媒体不完整。'],
  'Mídia indisponível no cofre remoto. Uma cópia já baixada pode continuar neste aparelho.':
    [
      'Media unavailable in the remote vault. A downloaded copy may remain on this device.',
      '远程保险库中的媒体不可用。已下载的副本可能仍保留在此设备上。',
    ],
  'Mídia não conservada nesta cópia local.': [
    'Media not preserved in this local copy.',
    '此本地副本未保留媒体。',
  ],
  'Mídia não está disponível no histórico importado.': [
    'Media unavailable in imported history.',
    '导入的历史中没有此媒体。',
  ],
  'Mídia não permitida.': ['Media not allowed.', '不允许此媒体。'],
  'Mídia pendente neste aparelho. Envie ou remova.': [
    'Media pending on this device. Send or remove it.',
    '此设备有待发送媒体。请发送或移除。',
  ],
  'Mídia preparada restrita ao autor': [
    'Prepared media restricted to the author',
    '已处理媒体仅作者可见',
  ],
  'Mídia pública excedida.': [
    'Public media exceeds the limit.',
    '公开媒体超过限制。',
  ],
  'Mídia pública incompleta.': ['Public media incomplete.', '公开媒体不完整。'],
  'Mídia pública indisponível.': [
    'Public media unavailable.',
    '公开媒体不可用。',
  ],
  'Mídia restaurada de outro grupo.': [
    'Restored media belongs to another group.',
    '恢复的媒体属于另一个群组。',
  ],
  'Mídia vazia.': ['Empty media.', '媒体为空。'],
  'Mídias em processamento. Aguarde.': [
    'Processing media. Please wait.',
    '正在处理媒体。请稍候。',
  ],
  'Mídias externas': ['External media', '外部媒体'],
  'Mídias externas permitidas.': [
    'External media allowed.',
    '已允许外部媒体。',
  ],
  'Mídias externas somente como links.': [
    'External media kept as links only.',
    '外部媒体仅保留为链接。',
  ],
  'Migração exige aparelho autorizado e configuração antiga.': [
    'Migration requires an authorized device and old configuration.',
    '迁移需要已授权设备及旧配置。',
  ],
  'Migração não estende a raiz local confiável.': [
    'Migration does not extend the trusted local root.',
    '迁移不会延伸可信本地根。',
  ],
  'Minha conta': ['My account', '我的账户'],
  'Minhas autorizações': ['My authorizations', '我的授权'],
  'Minhas comunidades': ['My communities', '我的社区'],
  'Miniatura ausente.': ['Thumbnail missing.', '缺少缩略图。'],
  'Miniatura do caso {0}': ['Thumbnail for case {0}', '案例 {0} 的缩略图'],
  'Miniatura excede o limite seguro.': [
    'Thumbnail exceeds the safe limit.',
    '缩略图超过安全限制。',
  ],
  Moderação: ['Moderation', '审核'],
  'Moderação automática': ['Automated moderation', '自动审核'],
  Moderador: ['Moderator', '管理员'],
  Moderadores: ['Moderators', '管理员'],
  'Moderadores indisponíveis agora.': [
    'Moderators currently unavailable.',
    '管理员暂时不可用。',
  ],
  'Modo de grupos inválido.': ['Invalid group mode.', '群组模式无效。'],
  'Mostrar GIF': ['Show GIF', '显示 GIF'],
  'Mostrar menos': ['Show less', '收起'],
  Motivo: ['Reason', '原因'],
  'Motivo da denúncia': ['Report reason', '举报原因'],
  'Motivo da denúncia do post': ['Post report reason', '帖子举报原因'],
  'Motivo da remoção': ['Removal reason', '移除原因'],
  'Motivo: {0}': ['Reason: {0}', '原因：{0}'],
  'Mudança no grupo não confirmada.': [
    'Group change not confirmed.',
    '群组更改未确认。',
  ],
  'Muitas alterações simultâneas nesta conversa. Tente novamente após sincronizar.':
    [
      'Too many simultaneous changes in this conversation. Sync, then try again.',
      '此对话中的并发更改过多。请同步后重试。',
    ],
  'Muitas versões de preferências. Resolva os conflitos antes de continuar.': [
    'Too many preference versions. Resolve conflicts before continuing.',
    '偏好设置版本过多。请解决冲突后继续。',
  ],
  'Muitos pedidos ao servidor. Aguarde e tente novamente.': [
    'Too many server requests. Wait and try again.',
    '服务器请求过多。请稍候再试。',
  ],
  'na administração': ['in management', '在管理设置中'],
  'na descrição da comunidade': [
    'in the community description',
    '在社区简介中',
  ],
  'na descrição do perfil': ['in the profile description', '在个人资料简介中'],
  'Nada novo por aqui.': ['Nothing new here.', '暂无新内容。'],
  'não aplicado.': ['not applied.', '未应用。'],
  'Não detectada aqui': ['Not detected here', '此处未检测到'],
  'Não enviado · some se a página recarregar': [
    'Not sent · disappears if the page reloads',
    '未发送 · 刷新页面后消失',
  ],
  'Não foi possível abrir a ampliação.': [
    'Could not open the enlarged image.',
    '无法打开放大的图片。',
  ],
  'Não foi possível abrir esta imagem. Remova o arquivo da fila e continue.': [
    'Could not open this image. Remove the file from the queue and continue.',
    '无法打开此图片。请从队列中移除文件后继续。',
  ],
  'Não foi possível abrir o grupo.': [
    'Could not open the group.',
    '无法打开群组。',
  ],
  'Não foi possível abrir o painel de emojis.': [
    'Could not open the emoji panel.',
    '无法打开表情面板。',
  ],
  'Não foi possível abrir o painel.': [
    'Could not open the panel.',
    '无法打开面板。',
  ],
  'Não foi possível abrir os emojis.': [
    'Could not open emoji.',
    '无法打开表情。',
  ],
  'Não foi possível abrir os envios pendentes deste aparelho.': [
    'Could not open pending sends on this device.',
    '无法打开此设备的待发送内容。',
  ],
  'Não foi possível apagar o pacote fictício.': [
    'Could not delete the fictional package.',
    '无法删除虚构数据包。',
  ],
  'Não foi possível ativar as notificações.': [
    'Could not enable notifications.',
    '无法启用通知。',
  ],
  'Não foi possível atualizar a presença.': [
    'Could not update presence.',
    '无法更新在线状态。',
  ],
  'Não foi possível atualizar a presença. Ela deixará de indicar online pelo prazo de atividade.':
    [
      'Could not update presence. Online status will stop after the activity timeout.',
      '无法更新在线状态。活动时限结束后，将不再显示在线。',
    ],
  'Não foi possível buscar. Continue escrevendo para tentar de novo.': [
    'Could not search. Keep typing to try again.',
    '无法搜索。继续输入即可重试。',
  ],
  'Não foi possível buscar. Tente novamente.': [
    'Could not search. Try again.',
    '无法搜索。请重试。',
  ],
  'Não foi possível carregar a preferência de som. A escolha atual vale nesta abertura.':
    [
      'Could not load sound preferences. The current choice applies for this visit.',
      '无法加载声音设置。当前选项仅适用于本次访问。',
    ],
  'Não foi possível carregar o áudio. Toque para tentar de novo.': [
    'Could not load audio. Tap to try again.',
    '无法加载音频。点击重试。',
  ],
  'Não foi possível carregar preferências.': [
    'Could not load preferences.',
    '无法加载偏好设置。',
  ],
  'Não foi possível carregar.': ['Could not load.', '无法加载。'],
  'Não foi possível concluir a análise com segurança. O conteúdo fica fora do público enquanto não houver aprovação.':
    [
      'Could not safely complete analysis. Content will not be public until approved.',
      '无法安全完成分析。在获批前，内容不会公开。',
    ],
  'Não foi possível concluir a análise. O arquivo continua restrito.': [
    'Could not complete analysis. The file remains restricted.',
    '无法完成分析。文件仍受限制。',
  ],
  'Não foi possível concluir a autorização.': [
    'Could not complete authorization.',
    '无法完成授权。',
  ],
  'Não foi possível concluir a operação de chamada.': [
    'Could not complete the call operation.',
    '无法完成通话操作。',
  ],
  'Não foi possível concluir a operação do grupo.': [
    'Could not complete the group operation.',
    '无法完成群组操作。',
  ],
  'Não foi possível concluir a operação.': [
    'Could not complete the operation.',
    '无法完成操作。',
  ],
  'Não foi possível concluir a sincronização das identidades. Tente novamente.':
    [
      'Could not complete identity synchronization. Try again.',
      '无法完成身份同步。请重试。',
    ],
  'Não foi possível concluir o backup.': [
    'Could not complete the backup.',
    '无法完成备份。',
  ],
  'Não foi possível concluir o status.': [
    'Could not complete the status.',
    '无法完成状态操作。',
  ],
  'Não foi possível conectar ao servidor.': [
    'Could not connect to the server.',
    '无法连接服务器。',
  ],
  'Não foi possível conectar este aparelho.': [
    'Could not connect this device.',
    '无法连接此设备。',
  ],
  'Não foi possível conferir a autorização agora. Uma nova atualização tentará novamente.':
    [
      'Could not check authorization now. The next update will try again.',
      '暂时无法检查授权。下次更新时将重试。',
    ],
  'Não foi possível conferir os envios pendentes.': [
    'Could not check pending sends.',
    '无法检查待发送内容。',
  ],
  'Não foi possível confirmar a remoção de metadados.': [
    'Could not confirm metadata removal.',
    '无法确认元数据已移除。',
  ],
  'Não foi possível consultar o armazenamento.': [
    'Could not check storage.',
    '无法查询存储空间。',
  ],
  'Não foi possível consultar o retorno. Confira a conexão e volte a esta tela.':
    [
      'Could not check the return. Check your connection and return to this screen.',
      '无法查询返回结果。请检查连接并返回此页面。',
    ],
  'Não foi possível copiar a wallet.': [
    'Could not copy the wallet address.',
    '无法复制钱包地址。',
  ],
  'Não foi possível copiar o texto.': [
    'Could not copy the text.',
    '无法复制文字。',
  ],
  'Não foi possível criar o pedido para abrir a wallet. Confira a conexão e tente novamente.':
    [
      'Could not create the wallet-opening request. Check your connection and try again.',
      '无法创建打开钱包的请求。请检查连接后重试。',
    ],
  'Não foi possível encerrar o áudio deste navegador.': [
    'Could not stop audio in this browser.',
    '无法停止此浏览器中的音频。',
  ],
  'Não foi possível encerrar o contexto do microfone.': [
    'Could not close the microphone context.',
    '无法关闭麦克风上下文。',
  ],
  'Não foi possível executar a prova neste navegador.': [
    'Could not run the proof in this browser.',
    '无法在此浏览器中运行证明。',
  ],
  'Não foi possível exibir a imagem. Você pode salvar o arquivo original.': [
    'Could not display the image. You can save the original file.',
    '无法显示图片。你可以保存原始文件。',
  ],
  'Não foi possível guardar o acesso local neste aparelho.': [
    'Could not save local access on this device.',
    '无法在此设备上保存本地访问权限。',
  ],
  'Não foi possível iniciar a chamada.': [
    'Could not start the call.',
    '无法发起通话。',
  ],
  'Não foi possível iniciar o processamento local de anexos.': [
    'Could not start local attachment processing.',
    '无法启动本地附件处理。',
  ],
  'Não foi possível ler este QR Code. Use o QR desta etapa ou copie o código.':
    [
      'Could not read this QR code. Use the QR code for this step or copy the code.',
      '无法读取此二维码。请使用此步骤的二维码，或复制代码。',
    ],
  'Não foi possível ler pela câmera. Confira a permissão ou copie o código.': [
    'Could not scan with the camera. Check permission or copy the code.',
    '无法通过摄像头扫描。请检查权限或复制代码。',
  ],
  'Não foi possível marcar como lida.': [
    'Could not mark as read.',
    '无法标记为已读。',
  ],
  'Não foi possível otimizar a foto para 3 MB.': [
    'Could not optimize the photo to 3 MB.',
    '无法将图片优化至 3 MB。',
  ],
  'Não foi possível pesquisar.': ['Could not search.', '无法搜索。'],
  'Não foi possível preparar a foto neste aparelho.': [
    'Could not prepare the photo on this device.',
    '无法在此设备上处理图片。',
  ],
  'Não foi possível preparar a gravação.': [
    'Could not prepare the recording.',
    '无法准备录音。',
  ],
  'Não foi possível preparar o histórico das conversas.': [
    'Could not prepare conversation history.',
    '无法准备对话历史。',
  ],
  'Não foi possível processar o anexo. Confira formato, tamanho, pixels e suporte do navegador.':
    [
      'Could not process the attachment. Check its format, size, pixels and browser support.',
      '无法处理附件。请检查格式、大小、像素及浏览器支持情况。',
    ],
  'Não foi possível publicar a resposta.': [
    'Could not publish the reply.',
    '无法发布回复。',
  ],
  'Não foi possível reconectar em 20 segundos.': [
    'Could not reconnect within 20 seconds.',
    '未能在 20 秒内重新连接。',
  ],
  'Não foi possível recuperar a sessão ou abrir o perfil privado. Confira a conexão.':
    [
      'Could not recover the session or open the private profile. Check your connection.',
      '无法恢复会话或打开私密个人资料。请检查连接。',
    ],
  'Não foi possível registrar a contestação.': [
    'Could not record the appeal.',
    '无法记录申诉。',
  ],
  'Não foi possível salvar as configurações.': [
    'Could not save settings.',
    '无法保存设置。',
  ],
  'Não foi possível salvar neste aparelho. O tema vale até fechar o app.': [
    'Could not save on this device. The theme applies until you close the app.',
    '无法保存到此设备。主题仅在关闭应用前有效。',
  ],
  'Não foi possível salvar preferências.': [
    'Could not save preferences.',
    '无法保存偏好设置。',
  ],
  'Não foi possível salvar; escolha válida só neste acesso.': [
    'Could not save; this choice applies only to this visit.',
    '无法保存；此选项仅适用于本次访问。',
  ],
  'Não foi possível salvar. Tente novamente.': [
    'Could not save. Try again.',
    '无法保存。请重试。',
  ],
  'Não há cópia local autorizada neste aparelho.': [
    'No authorized local copy on this device.',
    '此设备没有已授权的本地副本。',
  ],
  'Não há outras respostas disponíveis para exibir.': [
    'No more replies available to display.',
    '没有更多可显示的回复。',
  ],
  'não selecionada': ['not selected', '未选择'],
  'Navegação da resposta': ['Reply navigation', '回复导航'],
  'Navegação de comunidades': ['Community navigation', '社区导航'],
  'Navegação interrompeu a gravação; trecho preservado para conferir ao voltar à conversa.':
    [
      'Navigation interrupted recording; the excerpt is preserved for review when returning to the conversation.',
      '页面切换中断了录音；片段已保留，返回对话后可检查。',
    ],
  'Navegação interrompeu a gravação. Confira o trecho ao voltar.': [
    'Navigation interrupted recording. Check the excerpt when you return.',
    '页面切换中断了录音。返回后请检查片段。',
  ],
  'Negociação antiga ou de outro aparelho.': [
    'Negotiation outdated or from another device.',
    '协商已过时或来自其他设备。',
  ],
  'Nenhum áudio capturado. Tente novamente.': [
    'No audio captured. Try again.',
    '未录制到音频。请重试。',
  ],
  'Nenhum bloqueio nesta página.': [
    'No blocks on this page.',
    '此页面没有屏蔽记录。',
  ],
  'Nenhum contato disponível para adicionar.': [
    'No contacts available to add.',
    '没有可添加的联系人。',
  ],
  'Nenhum conteúdo foi incluído.': ['No content included.', '未包含任何内容。'],
  'Nenhum conteúdo nesta página com estes filtros.': [
    'No content on this page matches these filters.',
    '此页面没有符合筛选条件的内容。',
  ],
  'Nenhum dispositivo autorizado.': [
    'No authorized devices.',
    '没有已授权设备。',
  ],
  'Nenhum emoji encontrado.': ['No emoji found.', '未找到表情。'],
  'Nenhum GIF encontrado.': ['No GIFs found.', '未找到 GIF。'],
  'Nenhum item desta exportação está elegível para limpeza. Anexos precisam estar completos no arquivo.':
    [
      'No items in this export are eligible for cleanup. Attachments must be complete in the file.',
      '此导出没有符合清理条件的项目。文件中的附件必须完整。',
    ],
  'Nenhum moderador.': ['No moderators.', '没有管理员。'],
  'Nenhum pacote ativo para recuperação.': [
    'No active package for recovery.',
    '没有可恢复的当前数据包。',
  ],
  'Nenhum pacote ativo. Importe um arquivo válido ou crie um ensaio.': [
    'No active package. Import a valid file or create a test.',
    '没有当前数据包。请导入有效文件或创建测试。',
  ],
  'Nenhum pedido recebido. Os novos pedidos aparecem aqui.': [
    'No requests received. New requests appear here.',
    '尚未收到请求。新请求会显示在这里。',
  ],
  'Nenhum pedido recusado nesta página.': [
    'No declined requests on this page.',
    '此页面没有已拒绝请求。',
  ],
  'Nenhum perfil nesta lista.': [
    'No profiles in this list.',
    '此列表没有个人资料。',
  ],
  'Nenhum perfil ou comunidade encontrado.': [
    'No profiles or communities found.',
    '未找到个人资料或社区。',
  ],
  'Nenhum registro encontrado nesta agenda.': [
    'No records found in these contacts.',
    '未在联系人中找到记录。',
  ],
  'Nenhum resultado nos itens desta página.': [
    "No results in this page's items.",
    '此页面项目中没有搜索结果。',
  ],
  'Nenhum status ativo nesta página.': [
    'No active statuses on this page.',
    '此页面没有有效状态。',
  ],
  'Nenhum usuário ou comunidade encontrado.': [
    'No users or communities found.',
    '未找到用户或社区。',
  ],
  'Nenhuma autorização disponível nesta página. Crie e emita em Perfil → Organizações e representantes.':
    [
      'No authorizations available on this page. Create and issue them in Profile → Organizations and representatives.',
      '此页面没有可用授权。请在“个人资料 → 组织与代表”中创建并签发。',
    ],
  'Nenhuma comunidade nesta lista.': [
    'No communities in this list.',
    '此列表没有社区。',
  ],
  'Nenhuma comunidade seguida.': ['No followed communities.', '尚未关注社区。'],
  'Nenhuma conversa @ ainda. Abra um perfil público para mandar mensagem.': [
    'No handle conversations yet. Open a public profile to send a message.',
    '尚无用户名对话。打开公开个人资料即可发送消息。',
  ],
  'Nenhuma conversa carregada corresponde à busca.': [
    'No loaded conversations match the search.',
    '已加载对话中没有符合搜索条件的结果。',
  ],
  'Nenhuma conversa liberada. Adicione um contato ou aceite uma solicitação.': [
    'No conversations allowed yet. Add a contact or accept a request.',
    '尚无获准对话。请添加联系人或接受请求。',
  ],
  'Nenhuma conversa neste filtro.': [
    'No conversations in this filter.',
    '此筛选条件下没有对话。',
  ],
  'Nenhuma mensagem ainda.': ['No messages yet.', '暂无消息。'],
  'Nenhuma mensagem encontrada.': ['No messages found.', '未找到消息。'],
  'Nenhuma notificação nesta página.': [
    'No notifications on this page.',
    '此页面没有通知。',
  ],
  'Nenhuma postagem ainda': ['No posts yet', '暂无帖子'],
  'Nenhuma postagem nesta lista.': [
    'No posts in this list.',
    '此列表没有帖子。',
  ],
  'Nenhuma publicação pública nesta aba.': [
    'No public publications in this tab.',
    '此标签页没有公开发布内容。',
  ],
  'Nenhuma tag criada.': ['No tags created.', '尚未创建标签。'],
  'Nenhuma wallet de teste disponível.': [
    'No test wallet available.',
    '没有可用测试钱包。',
  ],
  'Nenhuma wallet detectada. Abra este endereço em um navegador com sua wallet de teste; não use uma conta com fundos.':
    [
      'No wallets detected. Open this address in a browser with your test wallet; do not use an account with funds.',
      '未检测到钱包。请在支持测试钱包的浏览器中打开此地址；不要使用有资金的账户。',
    ],
  'Neste aparelho': ['On this device', '在此设备上'],
  Nome: ['Name', '名称'],
  'Nome da comunidade': ['Community name', '社区名称'],
  'Nome da nova tag': ['New tag name', '新标签名称'],
  'Nome da organização': ['Organization name', '组织名称'],
  'Nome da tag': ['Tag name', '标签名称'],
  'Nome de grupo sem administrador autorizado.': [
    'Group name has no authorized administrator.',
    '群组名称缺少已授权管理员。',
  ],
  'Nome do badge (texto ou emoji)': [
    'Badge name (text or emoji)',
    '徽章名称（文字或表情）',
  ],
  'Nomear moderador': ['Appoint moderator', '任命管理员'],
  Notificações: ['Notifications', '通知'],
  'Notificações anteriores': ['Earlier notifications', '更早的通知'],
  'Notificações desligadas': ['Notifications off', '通知已关闭'],
  'Notificações deste aparelho': [
    'Notifications on this device',
    '此设备上的通知',
  ],
  'Notificações e chamadas': ['Notifications and calls', '通知与通话'],
  'Notificações ligadas': ['Notifications on', '通知已开启'],
  'Notificações neste aparelho': [
    'Notifications on this device',
    '此设备上的通知',
  ],
  'Notificações push': ['Push notifications', '推送通知'],
  'Nova publicação': ['New publication', '新发布内容'],
  'Nova raiz sem transição verificada.': [
    'New root without a verified transition.',
    '新根缺少已验证的过渡。',
  ],
  'Nova resposta ao seu conteúdo': [
    'New reply to your content',
    '你的内容收到新回复',
  ],
  'Nova versão pronta. Escolha quando atualizar.': [
    'New version ready. Choose when to update.',
    '新版本已就绪。你可以选择何时更新。',
  ],
  'Novas atualizações durante a conferência. Sincronize novamente.': [
    'New updates arrived during verification. Sync again.',
    '核验期间收到新更新。请重新同步。',
  ],
  'Novo aparelho': ['New device', '新设备'],
  'Novo aparelho vinculado.': ['New device linked.', '新设备已关联。'],
  'Novo convite ativo e preservado no cofre. O anterior foi invalidado.': [
    'New invitation active and preserved in the vault. The previous one was invalidated.',
    '新邀请已启用并保存在保险库中。先前的邀请已失效。',
  ],
  'O arquivo do ensaio deve ter até 4 KiB. Nenhum pacote está ativo.': [
    'The test file must be no larger than 4 KiB. No package is active.',
    '测试文件不得超过 4 KiB。没有当前数据包。',
  ],
  'O arquivo foi descartado ao terminar o prazo de sete dias sem aprovação.': [
    'The file was discarded after seven days without approval.',
    '文件在七天内未获批准，已被清除。',
  ],
  'O arquivo não aprovado foi descartado ao encerrar o prazo.': [
    'The unapproved file was discarded at the deadline.',
    '未获批准的文件已在到期后清除。',
  ],
  'O arquivo não corresponde a uma imagem PNG, JPEG ou WebP.': [
    'The file is not a PNG, JPEG or WebP image.',
    '此文件不是 PNG、JPEG 或 WebP 图片。',
  ],
  'O backup completo inclui conversas, áudios, imagens e arquivos.': [
    'The full backup includes conversations, audio, images and files.',
    '完整备份包含对话、音频、图片和文件。',
  ],
  'o backup em Perfil → Cofre e backup': [
    'the backup in Profile → Vault and backup',
    '“个人资料 → 保险库与备份”中的备份',
  ],
  'O banner da comunidade ficou fora do público': [
    'The community banner was withheld from public view',
    '社区横幅未公开展示',
  ],
  'O caminho de mídia não confirmou TURN nos dois extremos.': [
    'The media path did not confirm TURN at both endpoints.',
    '媒体路径未确认两个端点均使用 TURN。',
  ],
  'O caso recebido diverge da imagem enviada.': [
    'The received case differs from the uploaded image.',
    '收到的案例与上传图片不一致。',
  ],
  'O cofre ainda está carregando as configurações.': [
    'The vault is still loading settings.',
    '保险库仍在加载设置。',
  ],
  'O contato precisa abrir o aplicativo para preparar sua recuperação antes da primeira mensagem.':
    [
      'Your contact must open the app to prepare recovery before the first message.',
      '首次发送消息前，联系人需要打开应用以准备恢复信息。',
    ],
  'O convite diverge da sua identidade.': [
    'The invitation differs from your identity.',
    '邀请与你的身份不一致。',
  ],
  'O convite não tem mais administrador autorizado.': [
    'The invitation no longer has an authorized administrator.',
    '邀请已没有获授权的管理员。',
  ],
  'O destinatário precisa abrir Mensagens pelo @ neste app para preparar sua recuperação E2EE.':
    [
      'The recipient must open Handle messages in this app to prepare E2EE recovery.',
      '接收者需要在此应用中打开“用户名私信”，以准备端到端加密恢复信息。',
    ],
  'O destino da entrada mudou. Inicie novamente.': [
    'The sign-in destination changed. Start again.',
    '登录目标已更改。请重新开始。',
  ],
  'O ensaio foi ocultado durante a operação. Recarregue; nenhum resultado atrasado será guardado.':
    [
      'The test was hidden during the operation. Reload; no delayed result will be saved.',
      '操作期间测试被隐藏。请刷新；延迟结果不会保存。',
    ],
  'O ensaio já tem um pacote ou falta confirmar o uso de dados fictícios.': [
    'The test already has a package or fictional data use has not been confirmed.',
    '测试已有数据包，或尚未确认使用虚构数据。',
  ],
  'O envio desta rodada já foi concluído.': [
    "This round's upload is already complete.",
    '本轮上传已完成。',
  ],
  'o envio ou gravação em Conversas': [
    'sending or recording in Conversations',
    '“对话”中的发送或录音',
  ],
  'O envio push ainda não foi configurado neste ambiente.': [
    'Push delivery has not been configured in this environment yet.',
    '此环境尚未配置推送发送。',
  ],
  'O grupo foi fechado.': ['The group was closed.', '群组已关闭。'],
  'O histórico excede o limite de registros por arquivo.': [
    'History exceeds the per-file record limit.',
    '历史超过每个文件的记录上限。',
  ],
  'O laboratório rejeitou a operação.': [
    'The laboratory rejected the operation.',
    '实验环境拒绝了操作。',
  ],
  'O link chegou com parâmetros inválidos ou incompletos. Volte ao navegador original e crie um novo pedido.':
    [
      'The link arrived with invalid or incomplete parameters. Return to the original browser and create a new request.',
      '链接参数无效或不完整。请返回原浏览器并创建新请求。',
    ],
  'O link precisa ser renovado pelo administrador.': [
    'The administrator must renew the link.',
    '管理员需要续期此链接。',
  ],
  'O microfone enviou dados fora do limite. Confira o trecho preservado.': [
    'The microphone sent data beyond the limit. Check the preserved excerpt.',
    '麦克风发送的数据超过限制。请检查保留的片段。',
  ],
  'O microfone foi desconectado.': [
    'The microphone was disconnected.',
    '麦克风已断开连接。',
  ],
  'O microfone não encerrou normalmente. Confira o trecho capturado que foi preservado.':
    [
      'The microphone did not stop normally. Check the captured excerpt that was preserved.',
      '麦克风未正常停止。请检查已保留的录音片段。',
    ],
  'O microfone não respondeu a tempo. Tente novamente.': [
    'The microphone did not respond in time. Try again.',
    '麦克风未及时响应。请重试。',
  ],
  'O microfone parou de produzir áudio. Confira o trecho preservado.': [
    'The microphone stopped producing audio. Check the preserved excerpt.',
    '麦克风停止产生音频。请检查保留的片段。',
  ],
  'O mínimo de exposição: só convite, sem presença, GIFs como link e sem push.':
    [
      'Minimal exposure: invitation only, no presence, GIFs as links and no push.',
      '最低曝光：仅通过邀请联系，不显示在线状态，GIF 仅保留链接，不启用推送。',
    ],
  'O motivo será visível ao participante e aos gestores. Gestores devem perder a função antes de serem sancionados.':
    [
      'The reason is visible to the participant and managers. Managers must lose their role before being sanctioned.',
      '原因对成员和管理员可见。管理员必须先解除职务，才能受到处罚。',
    ],
  'O navegador interrompeu a gravação. Confira o trecho preservado ao voltar.':
    [
      'The browser interrupted recording. Check the preserved excerpt when you return.',
      '浏览器中断了录音。返回后请检查保留的片段。',
    ],
  'O navegador não concluiu o modo offline. Reabra a página para tentar novamente.':
    [
      'The browser did not complete offline mode. Reopen the page to try again.',
      '浏览器未完成离线模式设置。请重新打开页面以重试。',
    ],
  'O navegador não liberou a gravação. Tente novamente.': [
    'The browser did not allow recording. Try again.',
    '浏览器未允许录音。请重试。',
  ],
  'O navegador suspendeu o microfone.': [
    'The browser suspended the microphone.',
    '浏览器暂停了麦克风。',
  ],
  'O outro cliente ainda não publicou sua chave.': [
    'The other client has not published its key yet.',
    '另一客户端尚未发布密钥。',
  ],
  'O pacote não abriu: assinatura diferente ou dados adulterados.': [
    'The package could not open: different signature or tampered data.',
    '无法打开数据包：签名不同或数据遭到篡改。',
  ],
  'O pacote pertence a outra origem.': [
    'The package belongs to another origin.',
    '数据包属于其他来源。',
  ],
  'O pedido de abertura deste navegador foi perdido. Cancele e conecte novamente.':
    [
      "This browser's opening request was lost. Cancel and reconnect.",
      '此浏览器的打开请求已丢失。请取消后重新连接。',
    ],
  'O pedido de recuperação expirou.': [
    'The recovery request expired.',
    '恢复请求已过期。',
  ],
  'O pedido de recuperação expirou. Inicie novamente.': [
    'The recovery request expired. Start again.',
    '恢复请求已过期。请重新开始。',
  ],
  'O pedido excedeu o tempo de espera.': [
    'The request timed out.',
    '请求超时。',
  ],
  'O pedido foi interrompido.': [
    'The request was interrupted.',
    '请求已中断。',
  ],
  'O pedido foi recusado na entrada: pode ter expirado, sido cancelado ou já assinado, ou não corresponder ao ecossistema. Volte ao navegador original e crie um novo pedido.':
    [
      'The request was rejected at entry: it may have expired, been cancelled or already signed, or not match the ecosystem. Return to the original browser and create a new request.',
      '请求在入口处被拒绝：可能已过期、被取消、已签名，或生态系统不匹配。请返回原浏览器并创建新请求。',
    ],
  'O pedido foi recusado na entrada. Volte ao navegador original e crie um novo pedido.':
    [
      'The request was rejected at entry. Return to the original browser and create a new request.',
      '请求在入口处被拒绝。请返回原浏览器并创建新请求。',
    ],
  'O pedido na wallet expirou. Abra sua conta novamente.': [
    'The wallet request expired. Open your account again.',
    '钱包请求已过期。请重新打开账户。',
  ],
  'O pedido na wallet expirou. Toque em Abrir conta para tentar novamente.': [
    'The wallet request expired. Tap Open account to try again.',
    '钱包请求已过期。请点击“打开账户”以重试。',
  ],
  'O pedido não chegou à página de aprovação. Volte ao navegador original e crie um novo pedido.':
    [
      'The request did not reach the approval page. Return to the original browser and create a new request.',
      '请求未到达批准页面。请返回原浏览器并创建新请求。',
    ],
  'O prazo de sete dias terminou sem aprovação. O arquivo está sendo descartado.':
    [
      'The seven-day deadline passed without approval. The file is being discarded.',
      '七天期限内未获批准。文件正在清除。',
    ],
  'O prazo para abrir a câmera terminou. Tente novamente ou copie o código.': [
    'The camera-opening deadline passed. Try again or copy the code.',
    '打开摄像头的期限已到。请重试或复制代码。',
  ],
  'O prazo recebido para abrir a wallet é inválido ou já terminou. Crie um novo pedido.':
    [
      'The deadline received for opening the wallet is invalid or has passed. Create a new request.',
      '打开钱包的期限无效或已过。请创建新请求。',
    ],
  'O preparo offline continua. Mantenha o app aberto e conectado; a versão atual segue disponível.':
    [
      'Offline preparation continues. Keep the app open and connected; the current version remains available.',
      '离线准备仍在进行。请保持应用打开并联网；当前版本仍可使用。',
    ],
  'O processamento do microfone foi interrompido.': [
    'Microphone processing was interrupted.',
    '麦克风处理已中断。',
  ],
  'O que você escreveu e os anexos selecionados serão perdidos.': [
    'Your text and selected attachments will be lost.',
    '已撰写的文字和所选附件将丢失。',
  ],
  'O receptor desta entrada não está disponível. Inicie novamente.': [
    'The receiver for this sign-in is unavailable. Start again.',
    '此登录的接收端不可用。请重新开始。',
  ],
  'O retorno mobile exige HTTPS.': [
    'Mobile return requires HTTPS.',
    '手机返回流程需要 HTTPS。',
  ],
  'O serviço demorou a responder. Tente novamente.': [
    'The service took too long to respond. Try again.',
    '服务响应超时。请重试。',
  ],
  'O servidor recusou o pedido.': [
    'The server rejected the request.',
    '服务器拒绝了请求。',
  ],
  'O sistema interrompeu o microfone.': [
    'The system interrupted the microphone.',
    '系统中断了麦克风。',
  ],
  'Objeto divergente.': ['Object does not match.', '对象不匹配。'],
  Objetos: ['Objects', '物品'],
  'Ocultar ou mostrar nos meus feeds': [
    'Hide or show in my feeds',
    '在我的动态中隐藏或显示',
  ],
  'Ocultar pela moderação': ['Hide through moderation', '通过审核隐藏'],
  'Ocultar postagem': ['Hide post', '隐藏帖子'],
  Ocultos: ['Hidden', '已隐藏'],
  'Oferecer a propriedade a {0}? Ele precisa aceitar. Você ficará como membro comum após o aceite.':
    [
      'Offer ownership to {0}? They must accept. You will become a regular member after acceptance.',
      '向 {0} 转让所有权？对方需要接受。接受后，你将成为普通成员。',
    ],
  'Oferecer propriedade': ['Offer ownership', '转让所有权'],
  'Oferecer transferência': ['Offer transfer', '提出转让'],
  Online: ['Online', '在线'],
  'Opcional. Publique o TXT no painel DNS do domínio. O vínculo poderá ser compartilhado; não comprova titularidade legal ou reputação.':
    [
      "Optional. Publish the TXT record in the domain's DNS panel. The link may be shared; it does not prove legal ownership or reputation.",
      '选填。请在域名 DNS 面板中发布 TXT 记录。关联关系可分享，但不能证明合法所有权或信誉。',
    ],
  'Opções da mensagem': ['Message options', '消息选项'],
  'Opções de {0}': ['Options for {0}', '{0} 的选项'],
  'Opções de seguir indisponíveis.': [
    'Follow options unavailable.',
    '关注选项不可用。',
  ],
  'Opções do usuário': ['User options', '用户选项'],
  'Operação de mídia de grupo inválida.': [
    'Invalid group media operation.',
    '群组媒体操作无效。',
  ],
  'Operação fora do primeiro protótipo.': [
    'Operation outside the first prototype.',
    '操作不在首个原型的范围内。',
  ],
  'Operação indisponível.': ['Operation unavailable.', '操作不可用。'],
  'Operação indisponível. Confira o estado antes de repetir.': [
    'Operation unavailable. Check the state before retrying.',
    '操作不可用。请检查状态后重试。',
  ],
  'Operação interrompida. Se o reset já foi enviado, confira o armazenamento antes de repetir.':
    [
      'Operation interrupted. If reset was already sent, check storage before retrying.',
      '操作已中断。如果已发送重置请求，请检查存储状态后重试。',
    ],
  'Operação interrompida. Se uma limpeza foi enviada, confira o estado remoto.':
    [
      'Operation interrupted. If cleanup was sent, check the remote state.',
      '操作已中断。如果已发送清理请求，请检查远程状态。',
    ],
  'Operação não concluída. Confira a wallet e a conexão; tente novamente.': [
    'Operation not completed. Check your wallet and connection, then try again.',
    '操作未完成。请检查钱包和连接后重试。',
  ],
  'Operação não confirmada. Tente novamente.': [
    'Operation not confirmed. Try again.',
    '操作未确认。请重试。',
  ],
  'operação rejeitada': ['operation rejected', '操作被拒绝'],
  'Operação rejeitada. Confira segredo, identidade, revisão e integridade; nenhum histórico foi enviado em texto aberto.':
    [
      'Operation rejected. Check the secret, identity, revision and integrity; no plaintext history was sent.',
      '操作被拒绝。请检查密钥、身份、修订版本和完整性；未发送任何明文历史。',
    ],
  'Operação repetida na cadeia.': [
    'Duplicate operation in the chain.',
    '链中存在重复操作。',
  ],
  'operação solicitada': ['operation requested', '已请求操作'],
  'Orçamento local inválido.': ['Invalid local budget.', '本地预算无效。'],
  'Ordem de grupo inválida.': ['Invalid group order.', '群组顺序无效。'],
  'Ordem de remoções inválida.': ['Invalid removal order.', '移除顺序无效。'],
  'Ordem do backup divergente.': [
    'Backup order does not match.',
    '备份顺序不匹配。',
  ],
  'Ordem do índice divergente.': [
    'Index order does not match.',
    '索引顺序不匹配。',
  ],
  Ordenar: ['Sort', '排序'],
  'Ordenar comentários': ['Sort comments', '排序评论'],
  'Ordenar postagens': ['Sort posts', '排序帖子'],
  'Organização registrada.': ['Organization registered.', '组织已注册。'],
  'Organizações e autorizações assinadas': [
    'Organizations and signed authorizations',
    '组织与签名授权',
  ],
  'Organizações e representantes': [
    'Organizations and representatives',
    '组织与代表',
  ],
  'Origem de grupo diverge da conta do backup.': [
    'Group origin differs from the backup account.',
    '群组来源与备份账户不一致。',
  ],
  'Origem do ensaio inválida.': ['Invalid test origin.', '测试来源无效。'],
  'Origem do status incompleta.': [
    'Status origin incomplete.',
    '状态来源不完整。',
  ],
  'Origem inválida.': ['Invalid origin.', '来源无效。'],
  'Original do caso {0} — SHA-256 conferido': [
    'Original for case {0} — SHA-256 verified',
    '案例 {0} 的原始文件 — SHA-256 已核验',
  ],
  'Os aparelhos do autor mudaram. Tente novamente.': [
    "The author's devices changed. Try again.",
    '作者的设备已更改。请重试。',
  ],
  'Outras comunidades em alta': ['Other trending communities', '其他热门社区'],
  'Outras tags': ['Other tags', '其他标签'],
  'Ouvir chamada': ['Listen to call', '收听通话'],
  'Ouvir mensagem de voz': ['Listen to voice message', '播放语音消息'],
  'Pacote {0} recuperado com nova assinatura da conta {1}. Nenhuma assinatura ou chave anterior foi guardada pelo laboratório.':
    [
      'Package {0} recovered with a new signature from account {1}. No previous signature or key was kept by the laboratory.',
      '数据包 {0} 已通过账户 {1} 的新签名恢复。实验环境未保留任何旧签名或密钥。',
    ],
  'Pacote cifrado recebido pelo laboratório. O destinatário pode buscar.': [
    'Encrypted package received by the laboratory. The recipient can retrieve it.',
    '实验环境已收到加密数据包。接收者可以获取。',
  ],
  'Pacote de chave não autorizado ou inválido.': [
    'Key package unauthorized or invalid.',
    '密钥包未获授权或无效。',
  ],
  'Pacote de emojis excedido.': [
    'Emoji package exceeds the limit.',
    '表情包超过限制。',
  ],
  'Pacote de emojis indisponível.': [
    'Emoji package unavailable.',
    '表情包不可用。',
  ],
  'Pacote do armazenamento deste navegador': [
    "Package from this browser's storage",
    '此浏览器存储中的数据包',
  ],
  'Pacote do ensaio excedido.': [
    'Test package exceeds the limit.',
    '测试数据包超过限制。',
  ],
  'Pacote do ensaio inválido.': ['Invalid test package.', '测试数据包无效。'],
  'Página {0} de {1}': ['Page {0} of {1}', '第 {0} 页，共 {1} 页'],
  'Página de busca inválida.': ['Invalid search page.', '搜索页无效。'],
  'Página de cofre inválida.': ['Invalid vault page.', '保险库页面无效。'],
  'Página de cofre omitida.': ['Vault page omitted.', '保险库页面缺失。'],
  'Página de diretório inválida.': ['Invalid directory page.', '目录页无效。'],
  'Página de dispositivos inválida.': ['Invalid device page.', '设备页无效。'],
  'Página de mensagens de grupo inválida.': [
    'Invalid group message page.',
    '群组消息页无效。',
  ],
  'Página de prova incompleta.': ['Proof page incomplete.', '证明页面不完整。'],
  'Página de remoções inválida.': [
    'Invalid removals page.',
    '移除记录页面无效。',
  ],
  'Página do diretório de DMs inválida.': [
    'Invalid DM directory page.',
    '私信目录页无效。',
  ],
  'Página histórica de DMs não avançou.': [
    'Historical DM page did not advance.',
    '历史私信页面未推进。',
  ],
  'Página histórica excedida.': [
    'Historical page exceeds the limit.',
    '历史页面超过限制。',
  ],
  'Página histórica pertence a outra conta.': [
    'Historical page belongs to another account.',
    '历史页面属于另一个账户。',
  ],
  'Página pessoal de DMs inválida.': [
    'Invalid personal DM page.',
    '个人私信页面无效。',
  ],
  'Paginação de grupo divergente.': [
    'Group pagination does not match.',
    '群组分页不匹配。',
  ],
  'Paginação de grupos divergente.': [
    'Group list pagination does not match.',
    '群组列表分页不匹配。',
  ],
  'Paginação de mensagens divergente.': [
    'Message pagination does not match.',
    '消息分页不匹配。',
  ],
  'Paginação de remoções divergente.': [
    'Removal pagination does not match.',
    '移除记录分页不匹配。',
  ],
  'Painel de emojis incompleto.': [
    'Emoji panel incomplete.',
    '表情面板不完整。',
  ],
  'Painel de representantes indisponível.': [
    'Representative panel unavailable.',
    '代表面板不可用。',
  ],
  'Para abrir a wallet, use o endereço HTTPS de teste no aparelho. O loopback deste computador não serve para conexão mobile.':
    [
      "To open your wallet, use the HTTPS test address on your device. This computer's loopback address cannot be used for mobile connections.",
      '请在设备上使用 HTTPS 测试地址打开钱包。此电脑的回环地址无法用于手机连接。',
    ],
  'Para assinar organizações e autorizações, abra o 0xDMme no navegador da wallet ou use uma extensão. O retorno dessas assinaturas ao Chrome/Safari ainda está pendente.':
    [
      "To sign organizations and authorizations, open 0xDMme in your wallet's browser or use an extension. Returning these signatures to Chrome/Safari on mobile is still pending.",
      '签署组织和授权时，请在钱包浏览器中打开 0xDMme，或使用扩展程序。这些签名返回手机 Chrome/Safari 的流程仍待完成。',
    ],
  'Pare a gravação de voz antes de usar o microfone.': [
    'Stop voice recording before using the microphone.',
    '使用麦克风前，请先停止语音录制。',
  ],
  'Pare a gravação e confira a prévia antes de enviar.': [
    'Stop recording and check the preview before sending.',
    '请停止录音并检查预览后再发送。',
  ],
  'Pare ou cancele a gravação de voz antes de iniciar ou atender uma chamada. A prévia continuará disponível.':
    [
      'Stop or cancel voice recording before starting or answering a call. The preview remains available.',
      '发起或接听通话前，请停止或取消语音录制。预览仍会保留。',
    ],
  'Parte das configurações não foi aplicada. Ajuste o que faltou em Perfil.': [
    'Some settings were not applied. Adjust the remaining ones in Profile.',
    '部分设置未应用。请在“个人资料”中调整剩余设置。',
  ],
  'Parte de backup ausente.': ['Backup part missing.', '缺少备份分片。'],
  'Parte de backup inválida.': ['Invalid backup part.', '备份分片无效。'],
  'Parte do rascunho ausente. O reenvio não foi confirmado.': [
    'Draft part missing. Resending was not confirmed.',
    '缺少草稿分片。重发未确认。',
  ],
  'Parte local ausente ou corrompida; o envio não foi confirmado.': [
    'Local part missing or corrupted; sending was not confirmed.',
    '本地分片缺失或损坏；发送未确认。',
  ],
  'Parte recebida adulterada.': [
    'Received part tampered with.',
    '收到的分片遭到篡改。',
  ],
  'Partes de backup excedidas.': [
    'Backup parts exceed the limit.',
    '备份分片超过限制。',
  ],
  'Partes históricas excedidas.': [
    'Historical parts exceed the limit.',
    '历史分片超过限制。',
  ],
  'Partes não relacionadas no relatório.': [
    'Unrelated parts in the report.',
    '报告中存在无关分片。',
  ],
  Participação: ['Participation', '参与'],
  'Participação e denúncias': ['Participation and reports', '参与与举报'],
  'Participação encerrada: comunidade arquivada.': [
    'Participation ended: community archived.',
    '参与已结束：社区已归档。',
  ],
  'Participação mudou durante o backup. Tente novamente.': [
    'Membership changed during backup. Try again.',
    '备份期间成员身份已更改。请重试。',
  ],
  'Participante histórico divergente.': [
    'Historical participant does not match.',
    '历史成员不匹配。',
  ],
  'Participante sem diretório.': [
    'Participant has no directory.',
    '成员缺少目录。',
  ],
  'Participantes mudaram durante a leitura. Tente novamente.': [
    'Participants changed while reading. Try again.',
    '读取期间成员已更改。请重试。',
  ],
  Passa: ['Pass', '通过'],
  'Pausar mensagem de voz': ['Pause voice message', '暂停语音消息'],
  'Peça autorização ao contato para enviar novas mensagens. Seu histórico salvo continua disponível.':
    [
      'Ask your contact for permission to send new messages. Your saved history remains available.',
      '请请求联系人允许发送新消息。已保存的历史仍可使用。',
    ],
  'Peça para conversar com @{0}. A pessoa precisa aceitar.': [
    'Request a conversation with @{0}. They must accept.',
    '向 @{0} 发起聊天请求。对方需要接受。',
  ],
  'Pedido ausente ou perdido. Volte à aba que iniciou o login e crie um novo pedido.':
    [
      'Request missing or lost. Return to the tab that started sign-in and create a new request.',
      '请求缺失或丢失。请返回发起登录的标签页并创建新请求。',
    ],
  'Pedido ausente ou perdido. Volte ao navegador original e crie um novo pedido.':
    [
      'Request missing or lost. Return to the original browser and create a new request.',
      '请求缺失或丢失。请返回原浏览器并创建新请求。',
    ],
  'Pedido ausente. Inicie novamente.': [
    'Request missing. Start again.',
    '缺少请求。请重新开始。',
  ],
  'Pedido ausente. Reinicie pelo navegador original.': [
    'Request missing. Restart from the original browser.',
    '缺少请求。请从原浏览器重新开始。',
  ],
  'Pedido de abertura divergente.': [
    'Opening request does not match.',
    '打开请求不匹配。',
  ],
  'Pedido de aprovação ausente ou excedido.': [
    'Approval request missing or over the limit.',
    '批准请求缺失或超过限制。',
  ],
  'Pedido de aprovação inválido.': [
    'Invalid approval request.',
    '批准请求无效。',
  ],
  'Pedido de conversa': ['Conversation request', '聊天请求'],
  'Pedido de foto repetido com conteúdo diferente.': [
    'Photo request repeated with different content.',
    '图片请求被重复提交，但内容不同。',
  ],
  'Pedido de microfone cancelado. Nenhum áudio enviado.': [
    'Microphone request cancelled. No audio sent.',
    '麦克风请求已取消。未发送音频。',
  ],
  'Pedido de recuperação ausente.': [
    'Recovery request missing.',
    '缺少恢复请求。',
  ],
  'Pedido de recuperação excedido.': [
    'Recovery request exceeds the limit.',
    '恢复请求超过限制。',
  ],
  'Pedido de vinculação divergente.': [
    'Linking request does not match.',
    '关联请求不匹配。',
  ],
  'Pedido divergente.': ['Request does not match.', '请求不匹配。'],
  'Pedido encerrado ou wallet alterada.': [
    'Request ended or wallet changed.',
    '请求已结束或钱包已更改。',
  ],
  'Pedido encerrado.': ['Request ended.', '请求已结束。'],
  'Pedido enviado. Aguardando @{0} aceitar.': [
    'Request sent. Waiting for @{0} to accept.',
    '请求已发送。等待 @{0} 接受。',
  ],
  'Pedido excede o tamanho permitido.': [
    'Request exceeds the permitted size.',
    '请求超过允许的大小。',
  ],
  'Pedido excedido.': ['Request exceeds the limit.', '请求超过限制。'],
  'Pedido expirou ou é inválido.': [
    'Request expired or invalid.',
    '请求已过期或无效。',
  ],
  'Pedido expirou. Volte ao navegador original e inicie um novo pedido.': [
    'Request expired. Return to the original browser and start a new request.',
    '请求已过期。请返回原浏览器并发起新请求。',
  ],
  'Pedido interrompido ou expirado. Inicie novamente.': [
    'Request interrupted or expired. Start again.',
    '请求已中断或过期。请重新开始。',
  ],
  'Pedido inválido, alterado, expirado ou indisponível. Reinicie pelo navegador original.':
    [
      'Request invalid, changed, expired or unavailable. Restart from the original browser.',
      '请求无效、已更改、过期或不可用。请从原浏览器重新开始。',
    ],
  'Pedido inválido.': ['Invalid request.', '请求无效。'],
  'Pedido inválido. Volte ao navegador e crie um novo pedido.': [
    'Invalid request. Return to your browser and create a new request.',
    '请求无效。请返回浏览器并创建新请求。',
  ],
  'Pedido local de foto divergente.': [
    'Local photo request does not match.',
    '本地图片请求不匹配。',
  ],
  'Pedido local descartado. Se o servidor já tiver criado o grupo, ele continuará na lista.':
    [
      'Local request discarded. If the server already created the group, it remains in the list.',
      '本地请求已丢弃。如果服务器已创建群组，该群组仍会保留在列表中。',
    ],
  'Pedido recusado': ['Declined request', '已拒绝请求'],
  'Pedido recusado. A mesma identidade não pode repetir este pedido.': [
    'Request declined. The same identity cannot repeat this request.',
    '请求已拒绝。同一身份无法重复此请求。',
  ],
  'Pedido sem autorização atual.': [
    'Request has no current authorization.',
    '请求缺少当前授权。',
  ],
  Pedidos: ['Requests', '请求'],
  'Pedidos de conversa': ['Conversation requests', '聊天请求'],
  'Pedidos recebidos nesta página: {0}': [
    'Requests received on this page: {0}',
    '此页面收到的请求：{0}',
  ],
  Perfil: ['Profile', '个人资料'],
  'Perfil bloqueado. Autorize este aparelho por vinculação ou recuperação.': [
    'Profile locked. Authorize this device through linking or recovery.',
    '个人资料已锁定。请通过关联或恢复授权此设备。',
  ],
  'Perfil compartilhado': ['Shared profile', '已分享个人资料'],
  'Perfil de backup adulterado.': [
    'Backup profile tampered with.',
    '备份个人资料遭到篡改。',
  ],
  'Perfil disponível.': ['Profile available.', '个人资料可用。'],
  'Perfil e configurações': ['Profile and settings', '个人资料与设置'],
  'Perfil histórico de outro grupo.': [
    'Historical profile belongs to another group.',
    '历史个人资料属于另一个群组。',
  ],
  'Perfil inválido.': ['Invalid profile.', '个人资料无效。'],
  'Perfil público': ['Public profile', '公开个人资料'],
  'Perfil público · Leitura aberta': [
    'Public profile · Open access',
    '公开个人资料 · 公开阅读',
  ],
  'Perfil público alterado.': [
    'Public profile changed.',
    '公开个人资料已更改。',
  ],
  'Perfil público desde': ['Public profile since', '公开个人资料创建于'],
  'Perfil público histórico da DM ausente.': [
    'Historical public DM profile missing.',
    '缺少私信的历史公开个人资料。',
  ],
  'Perfil público indisponível.': [
    'Public profile unavailable.',
    '公开个人资料不可用。',
  ],
  'Perfil recebido · cópia local offline': [
    'Received profile · offline local copy',
    '收到的个人资料 · 离线本地副本',
  ],
  'Perfil removido': ['Removed profile', '已移除个人资料'],
  'Perfil restaurado do grupo divergente.': [
    'Restored group profile does not match.',
    '恢复的群组个人资料不匹配。',
  ],
  'Perfil salvo.': ['Profile saved.', '个人资料已保存。'],
  'Perfil selecionado: @{0}. Confira antes de confirmar.': [
    'Selected profile: @{0}. Check before confirming.',
    '已选择个人资料：@{0}。确认前请核对。',
  ],
  'Perfis em comum indisponíveis agora.': [
    'Mutual profiles currently unavailable.',
    '共同关注资料暂时不可用。',
  ],
  'Perfis que você segue': ['Profiles you follow', '你关注的个人资料'],
  'perfis que você segue nesta comunidade': [
    'profiles you follow in this community',
    '你在此社区中关注的个人资料',
  ],
  Período: ['Period', '时间范围'],
  'Permissão ainda não escolhida.': [
    'Permission not chosen yet.',
    '尚未选择权限。',
  ],
  'Permissão de GIFs retirada.': [
    'GIF permission withdrawn.',
    'GIF 权限已撤回。',
  ],
  'Permissão de notificação não concedida. Altere-a nas configurações do navegador para tentar novamente.':
    [
      'Notification permission not granted. Change it in browser settings to try again.',
      '通知权限未授予。请在浏览器设置中更改后重试。',
    ],
  'Permissões conferidas. Continue carregando o índice do cofre antes de editar a agenda.':
    [
      'Permissions verified. Continue loading the vault index before editing contacts.',
      '权限已核验。请继续加载保险库索引后再编辑联系人。',
    ],
  'Permita GIFs externos no Perfil para usar o KLIPY.': [
    'Allow external GIFs in Profile to use KLIPY.',
    '请在“个人资料”中允许外部 GIF，以使用 KLIPY。',
  ],
  Permitido: ['Allowed', '允许'],
  'Permitido / safe': ['Allowed / safe', '允许 / safe'],
  'Permitir GIFs': ['Allow GIFs', '允许 GIF'],
  'Permitir mídias externas': ['Allow external media', '允许外部媒体'],
  'Pesquisa incompleta.': ['Search incomplete.', '搜索不完整。'],
  Pesquisar: ['Search', '搜索'],
  'pessoa que você segue': ['person you follow', '你关注的人'],
  'Pessoas e corpo': ['People and body', '人物与身体'],
  'pessoas que você segue': ['people you follow', '你关注的人'],
  'Player externo indisponível.': [
    'External player unavailable.',
    '外部播放器不可用。',
  ],
  'PNG gerado incompleto.': [
    'Generated PNG incomplete.',
    '生成的 PNG 不完整。',
  ],
  'Política relay ausente.': ['Relay policy missing.', '缺少中继策略。'],
  'Por wallet exata ou convite': [
    'By exact wallet address or invitation',
    '通过准确钱包地址或邀请',
  ],
  'Posição do áudio': ['Audio position', '音频进度'],
  Postagem: ['Post', '帖子'],
  'Postagem com mídia': ['Post with media', '含媒体的帖子'],
  'Postagem compartilhada': ['Shared post', '分享的帖子'],
  'Postagem compartilhada indisponível.': [
    'Shared post unavailable.',
    '分享的帖子不可用。',
  ],
  'Postagem excluída pelo autor.': [
    'Post deleted by the author.',
    '帖子已被作者删除。',
  ],
  'Postagem indisponível.': ['Post unavailable.', '帖子不可用。'],
  'Postagem ocultada pela moderação.': [
    'Post hidden by moderation.',
    '帖子已被审核隐藏。',
  ],
  'Postagem original': ['Original post', '原始帖子'],
  'Postagem original: {0}': ['Original post: {0}', '原始帖子：{0}'],
  'Postagem publicada.': ['Post published.', '帖子已发布。'],
  'Postagem que você está respondendo': [
    'The post you are replying to',
    '你正在回复的帖子',
  ],
  'Postagem removida dos salvos.': [
    'Post removed from saved items.',
    '帖子已从保存项中移除。',
  ],
  'Postagem respondida': ['Replied-to post', '被回复的帖子'],
  'Postagem respondida indisponível: {0}': [
    'Replied-to post unavailable: {0}',
    '被回复的帖子不可用：{0}',
  ],
  'Postagem respondida indisponível.': [
    'Replied-to post unavailable.',
    '被回复的帖子不可用。',
  ],
  'Postagem salva': ['Saved post', '已保存帖子'],
  'Postagem salva.': ['Post saved.', '帖子已保存。'],
  Postar: ['Post', '发布'],
  Posts: ['Posts', '帖子'],
  'Posts anteriores': ['Earlier posts', '更早的帖子'],
  'Posts e respostas ocultos': [
    'Hidden posts and replies',
    '已隐藏的帖子与回复',
  ],
  'Posts indisponíveis.': ['Posts unavailable.', '帖子不可用。'],
  'Prazo de recuperação inválido.': [
    'Invalid recovery deadline.',
    '恢复期限无效。',
  ],
  'Prazo de vinculação inválido.': [
    'Invalid linking deadline.',
    '关联期限无效。',
  ],
  'Prazo encerrado. O arquivo está sendo descartado.': [
    'Deadline passed. The file is being discarded.',
    '期限已到。文件正在清除。',
  ],
  'Prazo inválido.': ['Invalid deadline.', '期限无效。'],
  'Preferência de som alterada só nesta abertura: o navegador não permitiu salvá-la.':
    [
      'Sound preference changed for this visit only: the browser did not allow saving.',
      '声音设置仅在本次访问中更改：浏览器未允许保存。',
    ],
  'Preferência de som do push inválida.': [
    'Invalid push sound preference.',
    '推送声音设置无效。',
  ],
  'Preferência de som inválida. Som ativado nesta abertura; escolha novamente nas configurações.':
    [
      'Invalid sound preference. Sound is on for this visit; choose again in settings.',
      '声音设置无效。本次访问启用声音；请在设置中重新选择。',
    ],
  'Preferência de status inválida.': [
    'Invalid status preference.',
    '状态设置无效。',
  ],
  'Preferência inválida.': ['Invalid preference.', '偏好设置无效。'],
  'Preferências de push salvas neste aparelho.': [
    'Push preferences saved on this device.',
    '推送设置已保存在此设备上。',
  ],
  'Preparação ainda em andamento. Tente novamente para retomar.': [
    'Preparation still in progress. Try again to resume.',
    '准备仍在进行。请重试以恢复。',
  ],
  'preparação da sessão': ['session preparation', '会话准备'],
  'Preparando backup: {0} itens.': [
    'Preparing backup: {0} items.',
    '正在准备备份：{0} 项。',
  ],
  'Preparando interface offline…': [
    'Preparing offline interface…',
    '正在准备离线界面…',
  ],
  'Preparando o backup completo…': [
    'Preparing full backup…',
    '正在准备完整备份…',
  ],
  'Preparando ZIP privado com originais e resultados…': [
    'Preparing private ZIP with originals and results…',
    '正在准备包含原始文件与结果的私密 ZIP…',
  ],
  'Presença inválida.': ['Invalid presence.', '在线状态无效。'],
  'Presença, leitura e quem pode me encontrar': [
    'Presence, read receipts and who can find me',
    '在线状态、已读回执与谁能找到我',
  ],
  'Preservação do anexo não confirmada.': [
    'Attachment preservation not confirmed.',
    '附件保留未确认。',
  ],
  Preto: ['Black', '黑色'],
  'Preto puro': ['Pure black', '纯黑'],
  Prévia: ['Preview', '预览'],
  'Prévia ausente.': ['Preview missing.', '缺少预览。'],
  'Prévia da foto ausente.': ['Photo preview missing.', '缺少图片预览。'],
  'Prévia da imagem escolhida': ['Selected image preview', '所选图片预览'],
  'Prévia do próximo status': ['Next status preview', '下一条状态预览'],
  'Prévia indisponível para esta imagem. O arquivo original está preservado.': [
    'Preview unavailable for this image. The original file is preserved.',
    '此图片无法预览。原始文件已保留。',
  ],
  'Prévia indisponível.': ['Preview unavailable.', '预览不可用。'],
  'Prévia local da imagem original': [
    'Local preview of the original image',
    '原始图片的本地预览',
  ],
  'Primeiras tags': ['Initial tags', '初始标签'],
  Privacidade: ['Privacy', '隐私'],
  'Privacidade de mídias externas': ['External media privacy', '外部媒体隐私'],
  'Privacidade não aplicada: o perfil está carregando ou com edição aberta.': [
    'Privacy settings not applied: the profile is loading or being edited.',
    '隐私设置未应用：个人资料正在加载或编辑中。',
  ],
  'Privacidade salva para os próximos status. As publicações atuais conservam sua audiência.':
    [
      'Privacy saved for future statuses. Current publications retain their audience.',
      '隐私设置已保存，将用于后续状态。当前发布内容保持原受众。',
    ],
  'Processamento de anexo excedeu o prazo.': [
    'Attachment processing timed out.',
    '附件处理超时。',
  ],
  'Processamento local de anexos indisponível.': [
    'Local attachment processing unavailable.',
    '本地附件处理不可用。',
  ],
  'Processamento local de imagem indisponível.': [
    'Local image processing unavailable.',
    '本地图片处理不可用。',
  ],
  'Processando…': ['Processing…', '正在处理…'],
  'Proibido / não safe': ['Prohibited / unsafe', '禁止 / unsafe'],
  'Pronto para testar conexão, assinatura e retorno. Nenhuma conta do 0xDMme será conectada.':
    [
      'Ready to test connection, signing and return. No 0xDMme account will be connected.',
      '可以测试连接、签名和返回。不会连接任何 0xDMme 账户。',
    ],
  'Pronto. Suas configurações foram salvas na conta.': [
    'Done. Your settings were saved to your account.',
    '完成。设置已保存到账户。',
  ],
  Propriedade: ['Ownership', '所有权'],
  'Propriedade aceita.': ['Ownership accepted.', '所有权已接受。'],
  'Propriedade do grupo atualizada.': [
    'Group ownership updated.',
    '群组所有权已更新。',
  ],
  'Propriedade e arquivamento': ['Ownership and archiving', '所有权与归档'],
  'Prova ausente ou expirada.': [
    'Proof missing or expired.',
    '证明缺失或已过期。',
  ],
  'Prova ausente.': ['Proof missing.', '缺少证明。'],
  'Prova cancelada. Retornos antigos não serão aceitos.': [
    'Proof cancelled. Old returns will not be accepted.',
    '证明已取消。旧返回结果不会被接受。',
  ],
  'Prova expirada. Inicie uma nova conexão.': [
    'Proof expired. Start a new connection.',
    '证明已过期。请发起新连接。',
  ],
  'Prova inválida.': ['Invalid proof.', '证明无效。'],
  'Prova não concluída. Confira a wallet e a conexão. Se o armazenamento estiver bloqueado, permita-o antes de iniciar uma nova prova.':
    [
      'Proof not completed. Check your wallet and connection. If storage is blocked, allow it before starting a new proof.',
      '证明未完成。请检查钱包和连接。如果存储被阻止，请允许存储后再发起新证明。',
    ],
  'Prova privada de entrada inválida.': [
    'Invalid private entry proof.',
    '私密进入证明无效。',
  ],
  'Prova rejeitada.': ['Proof rejected.', '证明被拒绝。'],
  'Prova ZK real válida. Geração: {0} ms; verificação: {1} ms. Prova: {2} bytes. Alteração e raiz sem o membro foram rejeitadas. Workers encerrados.':
    [
      'Real ZK proof valid. Generation: {0} ms; verification: {1} ms. Proof: {2} bytes. Modification and a root without the member were rejected. Workers stopped.',
      '真实零知识证明有效。生成：{0} 毫秒；验证：{1} 毫秒。证明：{2} 字节。修改及不含该成员的根均被拒绝。工作线程已停止。',
    ],
  'Próxima página': ['Next page', '下一页'],
  Próximos: ['Next', '下一页'],
  Publicação: ['Publication', '发布内容'],
  'Publicação cancelada.': ['Publication cancelled.', '发布已取消。'],
  'publicação das chaves públicas': ['public key publication', '公钥发布'],
  'Publicação divergente.': ['Publication does not match.', '发布内容不匹配。'],
  'Publicação encerrada ou removida.': [
    'Publication ended or removed.',
    '发布已结束或内容已移除。',
  ],
  'Publicação encerrada.': ['Publication ended.', '发布已结束。'],
  'Publicação lida': ['Publication read', '发布内容已读'],
  'Publicação não confirmada.': ['Publication not confirmed.', '发布未确认。'],
  'Publicação pendente. Retome o envio ou cancele antes de preparar outro status.':
    [
      'Publication pending. Resume or cancel the upload before preparing another status.',
      '发布待完成。请恢复或取消上传后，再准备下一条状态。',
    ],
  Publicações: ['Publications', '发布内容'],
  'Publicações nas comunidades': ['Community publications', '社区发布内容'],
  'Publicadas no período': ['Published in this period', '本时段发布'],
  'Publicando status…': ['Publishing status…', '正在发布状态…'],
  'Publicar postagem': ['Publish post', '发布帖子'],
  'Publicar resposta': ['Publish reply', '发布回复'],
  'Publicar status': ['Publish status', '发布状态'],
  'Push, sons e silêncio das conversas': [
    'Push, sounds and conversation muting',
    '推送、声音与对话静音',
  ],
  'QR Code de convite para contato': [
    'Contact invitation QR code',
    '联系人邀请二维码',
  ],
  'QR Code de vinculação de aparelho': [
    'Device linking QR code',
    '设备关联二维码',
  ],
  'QR Code excedido.': ['QR code exceeds the limit.', '二维码超过限制。'],
  'QR de confirmação inválido.': [
    'Invalid confirmation QR code.',
    '确认二维码无效。',
  ],
  'quadro analisado': ['analyzed frame', '已分析帧'],
  'quadros analisados': ['analyzed frames', '已分析帧'],
  'Quem pode pedir conversa': [
    'Who can request a conversation',
    '谁可以申请聊天',
  ],
  'Quer conversar · {0} · {1}': [
    'Wants to chat · {0} · {1}',
    '想与你聊天 · {0} · {1}',
  ],
  'Quero arquivar, preservando conteúdo e registros.': [
    'I want to archive, preserving content and records.',
    '我要归档，并保留内容与记录。',
  ],
  'Quero reabrir a participação.': [
    'I want to reopen participation.',
    '我要重新开放参与。',
  ],
  'Raiz local alterada.': ['Local root changed.', '本地根已更改。'],
  Ranking: ['Ranking', '排行榜'],
  'Ranking de comunidades': ['Community ranking', '社区排行榜'],
  'Rascunho anterior à limpeza. Nenhum conteúdo removido foi republicado; descarte-o ou recrie deliberadamente.':
    [
      'Draft predates cleanup. No removed content was republished; discard it or recreate explicitly.',
      '草稿早于清理。没有重新发布已移除内容；请丢弃草稿或主动重新创建。',
    ],
  'Rascunho de DM inválido.': ['Invalid DM draft.', '私信草稿无效。'],
  'Rascunho de grupo inválido.': ['Invalid group draft.', '群组草稿无效。'],
  'Rascunho de status encerrado.': ['Status draft ended.', '状态草稿已结束。'],
  'Rascunho inválido.': ['Invalid draft.', '草稿无效。'],
  'Rascunho local descartado. Isso não exclui uma mensagem que já tenha sido aceita.':
    [
      'Local draft discarded. This does not delete a message already accepted.',
      '本地草稿已丢弃。这不会删除已被接受的消息。',
    ],
  'Rascunho preservado. Reconecte para confirmar no cofre.': [
    'Draft preserved. Reconnect to confirm it in the vault.',
    '草稿已保留。请重新联网以在保险库中确认。',
  ],
  'Reabra a conta antes de salvar o perfil.': [
    'Reopen the account before saving the profile.',
    '请重新打开账户后再保存个人资料。',
  ],
  'Reabrir comunidade': ['Reopen community', '重新开放社区'],
  Reação: ['Reaction', '表情回应'],
  'Reação inválida.': ['Invalid reaction.', '表情回应无效。'],
  'Reagir…': ['React…', '回应…'],
  'Reativar microfone': ['Re-enable microphone', '重新启用麦克风'],
  'Recarregar comunidade': ['Reload community', '重新加载社区'],
  'Recarregar conversa': ['Reload conversation', '重新加载对话'],
  'Recarregar lista': ['Reload list', '重新加载列表'],
  'Recarregar notificações': ['Reload notifications', '重新加载通知'],
  'Recarregar postagens': ['Reload posts', '重新加载帖子'],
  'Recebida e preservada': ['Received and preserved', '已接收并保留'],
  'Recebida por um aparelho do destinatário': [
    "Received by one of the recipient's devices",
    '接收者的一台设备已收到',
  ],
  'Recebimento de chamadas ativado.': [
    'Incoming calls enabled.',
    '来电已启用。',
  ],
  'Recebimento de chamadas desativado.': [
    'Incoming calls disabled.',
    '来电已关闭。',
  ],
  'Recebimento em tempo real conectado.': [
    'Live updates connected.',
    '实时更新已连接。',
  ],
  'Recebimento em tempo real encerrado.': [
    'Live updates ended.',
    '实时更新已结束。',
  ],
  'Recebimento em tempo real indisponível.': [
    'Live updates unavailable.',
    '实时更新不可用。',
  ],
  'Recebimento em tempo real indisponível. O app continua conferindo a cada 30 segundos; você também pode sincronizar.':
    [
      'Live updates unavailable. The app keeps checking every 30 seconds; you can also sync.',
      '实时更新不可用。应用会继续每 30 秒检查一次；你也可以手动同步。',
    ],
  'Recebimento em tempo real pausado. Ao retornar, o app confere o estado atual.':
    [
      'Live updates paused. The app checks the current state when you return.',
      '实时更新已暂停。返回后，应用会检查当前状态。',
    ],
  'Recebimento em tempo real sem resposta.': [
    'Live updates unresponsive.',
    '实时更新无响应。',
  ],
  'Recebimento inválido.': ['Invalid receipt.', '接收凭据无效。'],
  Recentes: ['Recent', '最近'],
  'Reconectando pelo TURN…': [
    'Reconnecting through TURN…',
    '正在通过 TURN 重新连接…',
  ],
  'Reconecte para cancelar a reserva remota deste anexo.': [
    "Reconnect to cancel this attachment's remote reservation.",
    '请重新联网以取消此附件的远程预留。',
  ],
  'Reconecte para confirmar a exclusão de um envio que pode ter sido aceito.': [
    'Reconnect to confirm deletion of a send that may have been accepted.',
    '请重新联网，以确认删除可能已被接受的发送内容。',
  ],
  'Reconecte para liberar a reserva remota antes de descartar.': [
    'Reconnect to release the remote reservation before discarding.',
    '丢弃前请重新联网，以释放远程预留。',
  ],
  'Recuperação da DM ausente.': ['DM recovery missing.', '缺少私信恢复信息。'],
  'Recuperação das DMs tem versões concorrentes. Preserve as cópias antes de resolver.':
    [
      'DM recovery has concurrent versions. Preserve copies before resolving.',
      '私信恢复信息存在并发版本。解决前请保留副本。',
    ],
  'Recuperação de membro ausente.': [
    'Member recovery missing.',
    '缺少成员恢复信息。',
  ],
  'Recuperação de outra conta.': [
    'Recovery belongs to another account.',
    '恢复信息属于另一个账户。',
  ],
  'Recuperação do contato divergente.': [
    'Contact recovery does not match.',
    '联系人恢复信息不匹配。',
  ],
  'Recuperação do destinatário não está autorizada.': [
    'Recipient recovery not authorized.',
    '接收者恢复信息未获授权。',
  ],
  'Recuperação incompleta: o perfil antigo não abre neste aparelho. Configure pelo navegador que possui a chave do perfil.':
    [
      'Recovery incomplete: the old profile cannot open on this device. Configure it in the browser holding the profile key.',
      '恢复不完整：旧个人资料无法在此设备上打开。请在持有个人资料密钥的浏览器中配置。',
    ],
  'Recuperação não concluída. Confira a conta e a conexão; reinicie o pedido no navegador original.':
    [
      'Recovery not completed. Check your account and connection; restart the request in the original browser.',
      '恢复未完成。请检查账户和连接，并在原浏览器中重新发起请求。',
    ],
  'Recuperação ou aparelho sem autorização atual.': [
    'Recovery or device lacks current authorization.',
    '恢复信息或设备缺少当前授权。',
  ],
  'Recuperação rejeitada: chave, conta ou integridade inválida.': [
    'Recovery rejected: invalid key, account or integrity.',
    '恢复被拒绝：密钥、账户或完整性无效。',
  ],
  'Recuperando o pedido iniciado no seu navegador…': [
    'Recovering the request started in your browser…',
    '正在恢复由你浏览器发起的请求…',
  ],
  Recusada: ['Declined', '已拒绝'],
  Recusar: ['Decline', '拒绝'],
  'Rede EVM inválida.': ['Invalid EVM network.', 'EVM 网络无效。'],
  'Referência · {0}': ['Reference · {0}', '参考 · {0}'],
  'Referência do bloqueio: {0}': ['Block reference: {0}', '拦截参考：{0}'],
  'Referência do caso {0} salva. Scores preservados.': [
    'Reference for case {0} saved. Scores preserved.',
    '案例 {0} 的参考标注已保存。评分已保留。',
  ],
  'Referência incompleta.': ['Reference incomplete.', '引用不完整。'],
  'Registrando contestação…': ['Recording appeal…', '正在记录申诉…'],
  'Registro da sua agenda particular': [
    'Record from your private contacts',
    '你的私密联系人记录',
  ],
  'Registro de backup excedido.': [
    'Backup record exceeds the limit.',
    '备份记录超过限制。',
  ],
  'Registro de chamadas inválido.': ['Invalid call record.', '通话记录无效。'],
  'Registro de DM inválido.': ['Invalid DM record.', '私信记录无效。'],
  'Registro de organização divergente.': [
    'Organization record does not match.',
    '组织记录不匹配。',
  ],
  'Registro excedido.': ['Record exceeds the limit.', '记录超过限制。'],
  'Registro histórico corrompido.': [
    'Historical record corrupted.',
    '历史记录损坏。',
  ],
  'Registro histórico inválido.': [
    'Invalid historical record.',
    '历史记录无效。',
  ],
  'Registro inválido.': ['Invalid record.', '记录无效。'],
  'Registro não suportado.': ['Unsupported record.', '不支持此记录。'],
  'Registros excedidos.': ['Records exceed the limit.', '记录超过限制。'],
  'Registros repetidos ou seleção excedida.': [
    'Duplicate records or selection over the limit.',
    '记录重复或选择超过限制。',
  ],
  'Registros repetidos, omitidos ou excedidos.': [
    'Records duplicated, omitted or over the limit.',
    '记录重复、缺失或超过限制。',
  ],
  Regras: ['Rules', '规则'],
  'Regras da comunidade': ['Community rules', '社区规则'],
  'Regras locais': ['Local rules', '本地规则'],
  'Relação de versões privada inválida.': [
    'Invalid private version relationship.',
    '私密版本关系无效。',
  ],
  'Relatório de backup excedido.': [
    'Backup report exceeds the limit.',
    '备份报告超过限制。',
  ],
  'Relatório de omissões inválido.': [
    'Invalid omissions report.',
    '遗漏报告无效。',
  ],
  'Relatório excedido.': ['Report exceeds the limit.', '报告超过限制。'],
  'Relatório final ausente.': ['Final report missing.', '缺少最终报告。'],
  'Relatório inválido.': ['Invalid report.', '报告无效。'],
  'Relay recebeu apenas o envelope cifrado, em memória. Segredo e histórico ficaram no cliente.':
    [
      'The relay received only the encrypted envelope in memory. The secret and history stayed on the client.',
      '中继仅在内存中收到加密封装。密钥和历史保留在客户端。',
    ],
  'Remetente não autorizado.': ['Sender not authorized.', '发送者未获授权。'],
  Remoção: ['Removal', '移除'],
  'Remova um pouco do texto para adicionar o GIF.': [
    'Remove some text to add the GIF.',
    '请删减部分文字以添加 GIF。',
  ],
  Remover: ['Remove', '移除'],
  'Remover {0}': ['Remove {0}', '移除 {0}'],
  'Remover {0} do grupo?': ['Remove {0} from the group?', '将 {0} 移出群组？'],
  'Remover a mídia atual': ['Remove current media', '移除当前媒体'],
  'Remover badge do membro': ['Remove badge from member', '移除成员徽章'],
  'Remover banner': ['Remove banner', '移除横幅'],
  'Remover contato': ['Remove contact', '移除联系人'],
  'Remover dos favoritos': ['Remove from favorites', '从收藏中移除'],
  'Remover foto': ['Remove photo', '移除图片'],
  'Remover minha reação': ['Remove my reaction', '移除我的回应'],
  'Remover postagem dos salvos': [
    'Remove post from saved items',
    '从保存项中移除帖子',
  ],
  'Repetição ou conflito de mensagem.': [
    'Duplicate or conflicting message.',
    '消息重复或存在冲突。',
  ],
  'Representante: {0} · {1}': ['Representative: {0} · {1}', '代表：{0} · {1}'],
  'Reproduzir vídeo do YouTube': ['Play YouTube video', '播放 YouTube 视频'],
  Reservado: ['Reserved', '低曝光'],
  'Reservas de anexos divergentes.': [
    'Attachment reservations do not match.',
    '附件预留不匹配。',
  ],
  'Reservas de fotos divergentes.': [
    'Photo reservations do not match.',
    '图片预留不匹配。',
  ],
  'Resetar cofre': ['Reset vault', '重置保险库'],
  'Resetar os dados preservados neste backup somente do seu cofre no servidor? Mensagens posteriores e cópias de outras pessoas permanecem.':
    [
      "Reset the data preserved in this backup only from your server vault? Later messages and other people's copies remain.",
      '仅从服务器上的你的保险库中重置此备份已保留的数据？后续消息和他人的副本仍会保留。',
    ],
  'Resolva as versões deste contato antes de abrir a lista.': [
    "Resolve this contact's versions before opening the list.",
    '请解决此联系人的版本冲突后再打开列表。',
  ],
  'Resolva as versões deste contato antes de salvar.': [
    "Resolve this contact's versions before saving.",
    '请解决此联系人的版本冲突后再保存。',
  ],
  'Resolva as versões deste favorito antes de continuar.': [
    "Resolve this favorite's versions before continuing.",
    '请解决此收藏项的版本冲突后再继续。',
  ],
  'Resolva os conflitos do convite no cofre antes de criar outro.': [
    'Resolve invitation conflicts in the vault before creating another.',
    '请先解决保险库中的邀请冲突，再创建新邀请。',
  ],
  'Resolver contato: confira antes de salvar': [
    'Resolve contact: check before saving',
    '解决联系人冲突：保存前请核对',
  ],
  'Resolver usando esta versão': [
    'Resolve using this version',
    '使用此版本解决冲突',
  ],
  Respondendo: ['Replying', '正在回复'],
  Responder: ['Reply', '回复'],
  'Responder à postagem': ['Reply to post', '回复帖子'],
  Resposta: ['Reply', '回复'],
  'Resposta / motivo da revisão': ['Response / review reason', '回复/复核原因'],
  'Resposta ausente.': ['Reply missing.', '缺少回复。'],
  'Resposta da moderação': ['Moderation response', '审核回复'],
  'Resposta de assinatura inválida.': [
    'Invalid signing response.',
    '签名响应无效。',
  ],
  'Resposta de tag inválida.': ['Invalid tag response.', '标签响应无效。'],
  'Resposta do ensaio rejeitada.': [
    'Test response rejected.',
    '测试响应被拒绝。',
  ],
  'Resposta excede o orçamento do ensaio.': [
    'Response exceeds the test budget.',
    '响应超过测试预算。',
  ],
  'Resposta excedida.': ['Response exceeds the limit.', '响应超过限制。'],
  'Resposta inválida da coleta.': [
    'Invalid collection response.',
    '采集响应无效。',
  ],
  'Resposta inválida do servidor.': [
    'Invalid server response.',
    '服务器响应无效。',
  ],
  'Resposta inválida.': ['Invalid response.', '响应无效。'],
  'Resposta na discussão': ['Reply in the discussion', '讨论中的回复'],
  'Resposta protegida ausente.': [
    'Protected response missing.',
    '缺少受保护的响应。',
  ],
  'Resposta publicada.': ['Reply published.', '回复已发布。'],
  'Resposta: {0}': ['Reply: {0}', '回复：{0}'],
  'Resposta: mensagem original fora desta página ou indisponível.': [
    'Reply: original message is outside this page or unavailable.',
    '回复：原始消息不在此页面中或不可用。',
  ],
  Respostas: ['Replies', '回复'],
  'Respostas a este comentário': ['Replies to this comment', '此评论的回复'],
  'Respostas anteriores': ['Earlier replies', '更早的回复'],
  'Respostas ao seu conteúdo': ['Replies to your content', '对你内容的回复'],
  'Respostas ao seu conteúdo e posts/respostas de contas com o sininho ativado.':
    [
      'Replies to your content and posts/replies from accounts with notifications enabled.',
      '对你内容的回复，以及已开启通知账户的帖子和回复。',
    ],
  'Respostas indisponíveis para sua participação.': [
    'Replies unavailable for your membership.',
    '你的成员身份无法访问回复。',
  ],
  Restaurado: ['Restored', '已恢复'],
  'Restaurar postagem': ['Restore post', '恢复帖子'],
  'Resultado cifrado enviado. Volte ao navegador original; a abertura da conta será concluída automaticamente. Esta página não cria uma sessão ou autoriza aparelhos.':
    [
      'Encrypted result sent. Return to the original browser; account opening will finish automatically. This page does not create a session or authorize devices.',
      '加密结果已发送。请返回原浏览器；账户打开流程会自动完成。此页面不会创建会话或授权设备。',
    ],
  'Resultado da análise': ['Analysis result', '分析结果'],
  'Resultado incerto': ['Uncertain result', '结果不确定'],
  Resultados: ['Results', '结果'],
  'Retirar compartilhamento do meu perfil': [
    'Remove share from my profile',
    '取消在个人资料中分享',
  ],
  'Retirar sanção': ['Lift sanction', '撤销处罚'],
  Retomar: ['Resume', '恢复'],
  'Retome a criação pendente com o mesmo nome ou descarte esse pedido antes de criar outro grupo.':
    [
      'Resume the pending creation with the same name or discard that request before creating another group.',
      '请使用相同名称恢复待完成的创建，或丢弃该请求后再创建其他群组。',
    ],
  'retome ao abrir o grupo.': [
    'resume when opening the group.',
    '打开群组时恢复。',
  ],
  'Retorno de recuperação indisponível, expirado ou recusado. Inicie novamente.':
    [
      'Recovery return unavailable, expired or rejected. Start again.',
      '恢复返回结果不可用、已过期或被拒绝。请重新开始。',
    ],
  'Retorno de recuperação inválido.': [
    'Invalid recovery return.',
    '恢复返回结果无效。',
  ],
  'Retorno inválido ou de outra prova.': [
    'Return invalid or from another proof.',
    '返回结果无效或来自其他证明。',
  ],
  'Retorno inválido ou expirado.': [
    'Return invalid or expired.',
    '返回结果无效或已过期。',
  ],
  'Revisão de histórico inválida.': [
    'Invalid history revision.',
    '历史修订版本无效。',
  ],
  'Revisão: {0}': ['Revision: {0}', '修订版本：{0}'],
  'Revogação divergente.': ['Revocation does not match.', '撤销记录不匹配。'],
  Revogada: ['Revoked', '已撤销'],
  Revogar: ['Revoke', '撤销'],
  'Revogar autorização': ['Revoke authorization', '撤销授权'],
  'Revogar esta autorização? Ela não poderá voltar a ser vigente.': [
    'Revoke this authorization? It cannot become valid again.',
    '撤销此授权？撤销后无法重新生效。',
  ],
  'Revogar este aparelho? Ele perderá acesso aos novos dados.': [
    'Revoke this device? It will lose access to new data.',
    '撤销此设备的授权？设备将失去访问新数据的权限。',
  ],
  'Rodada inválida recebida da coleta.': [
    'Invalid round received from collection.',
    '从采集端收到的轮次无效。',
  ],
  'Rostos e emoções': ['Faces and emotions', '面部与情绪'],
  'Rota desconhecida.': ['Unknown route.', '未知路由。'],
  'Rotação pendente: envio bloqueado.': [
    'Rotation pending: sending blocked.',
    '轮换待完成：发送被阻止。',
  ],
  'Saia da conta atual antes de vincular outra conta.': [
    'Sign out of the current account before linking another.',
    '关联其他账户前，请先退出当前账户。',
  ],
  'Sair do grupo? Você perderá o acesso ao cofre remoto.': [
    'Leave the group? You will lose access to the remote vault.',
    '退出群组？你将失去访问远程保险库的权限。',
  ],
  Salvar: ['Save', '保存'],
  'Salvar guarda o apelido na agenda; solicitar conversa depende do aceite.': [
    'Saving stores the nickname in contacts; a conversation request requires acceptance.',
    '保存会将备注名存入联系人；聊天请求仍需要对方接受。',
  ],
  'Salvar guarda o contato; pedir conversa continua sujeito ao aceite.': [
    'Saving stores the contact; requesting a conversation still requires acceptance.',
    '保存会存储联系人；申请聊天仍需要对方接受。',
  ],
  'Salvar na minha agenda': ['Save to my contacts', '保存到我的联系人'],
  'Salvar no aparelho': ['Save on device', '保存到设备'],
  'Salvar postagem': ['Save post', '保存帖子'],
  'Salvar preservará as versões anteriores e resolverá os ramos escolhidos.': [
    'Saving preserves previous versions and resolves the selected branches.',
    '保存会保留先前版本，并解决所选分支的冲突。',
  ],
  'Salvar tag': ['Save tag', '保存标签'],
  'Salve um backup completo para manter uma cópia com você.': [
    'Save a full backup to keep your own copy.',
    '保存完整备份，以保留自己的副本。',
  ],
  Salvo: ['Saved', '已保存'],
  Salvos: ['Saved', '已保存'],
  'Sanção retirada': ['Sanction lifted', '处罚已撤销'],
  'Sanções e contestações': ['Sanctions and appeals', '处罚与申诉'],
  Search: ['Search', '搜索'],
  'Seções da configuração': ['Settings sections', '设置分区'],
  'Segredo das DMs ausente do cofre. Restaure seu cofre antes de continuar.': [
    'DM secret missing from the vault. Restore your vault before continuing.',
    '保险库中缺少私信密钥。请恢复保险库后继续。',
  ],
  'Segredo das DMs inválido.': ['Invalid DM secret.', '私信密钥无效。'],
  'Segredo de recuperação inválido.': [
    'Invalid recovery secret.',
    '恢复密钥无效。',
  ],
  'Segredo excede o formato.': [
    'Secret exceeds the format.',
    '密钥超出格式限制。',
  ],
  'Segredo fictício gerado somente neste navegador. Copie para o ensaio de recuperação.':
    [
      'Fictional secret generated only in this browser. Copy it for the recovery test.',
      '虚构密钥仅在此浏览器中生成。请复制以用于恢复测试。',
    ],
  'Segredo inválido.': ['Invalid secret.', '密钥无效。'],
  'Segredos pertencem a outra versão ou conta.': [
    'Secrets belong to another version or account.',
    '密钥属于其他版本或账户。',
  ],
  'Seguida por {0}': ['Followed by {0}', '{0} 已关注'],
  'Seguida por {0} e mais {1} que você segue': [
    'Followed by {0} and {1} more you follow',
    '{0} 和另外 {1} 位你关注的人已关注',
  ],
  Seguidas: ['Following', '已关注'],
  Seguidores: ['Followers', '关注者'],
  'seguidores · arquivada': ['followers · archived', '位关注者 · 已归档'],
  'Seguidores em comum': ['Mutual followers', '共同关注者'],
  'Seguidores em comum indisponíveis.': [
    'Mutual followers unavailable.',
    '共同关注者不可用。',
  ],
  'Seguidores indisponíveis.': ['Followers unavailable.', '关注者不可用。'],
  Seguindo: ['Following', '关注'],
  Seguir: ['Follow', '关注'],
  'Seguir comunidade ou autor': [
    'Follow community or author',
    '关注社区或作者',
  ],
  'Segure para gravar ou toque duas vezes.': [
    'Hold to record or tap twice.',
    '长按录音，或点击两次。',
  ],
  'Seleção de aparelhos inválida. Confira a lista novamente.': [
    'Invalid device selection. Check the list again.',
    '设备选择无效。请重新检查列表。',
  ],
  'Seleção inválida.': ['Invalid selection.', '选择无效。'],
  'Selecione a wallet da conta aberta para confirmar as ações sensíveis.': [
    "Select the open account's wallet to confirm sensitive actions.",
    '请选择已打开账户的钱包，以确认敏感操作。',
  ],
  'Selecione a wallet da conta aberta.': [
    "Select the open account's wallet.",
    '请选择已打开账户的钱包。',
  ],
  'Selecione a wallet e o ecossistema do pedido original.': [
    'Select the wallet and ecosystem from the original request.',
    '请选择原始请求的钱包和生态系统。',
  ],
  'Selecione e valide o arquivo salvo e conecte antes de limpar.': [
    'Select and validate the saved file, then connect before cleanup.',
    '请先选择并验证已保存文件，再联网执行清理。',
  ],
  'Selecione imagens ou conclua o envio.': [
    'Select images or complete the upload.',
    '请选择图片或完成上传。',
  ],
  'Selecione um contato aprovado': [
    'Select an approved contact',
    '选择已批准的联系人',
  ],
  'Selecione um contato aprovado para encaminhar.': [
    'Select an approved contact to forward to.',
    '请选择已批准联系人以转发。',
  ],
  'Selecione um contato e escreva a mensagem ou escolha um anexo.': [
    'Select a contact and write a message or choose an attachment.',
    '请选择联系人，并撰写消息或选择附件。',
  ],
  'Selecione uma conta EVM na wallet.': [
    'Select an EVM account in your wallet.',
    '请在钱包中选择 EVM 账户。',
  ],
  'Selecione uma conta Solana que assine mensagens: a conexão não disponibilizou uma conta autorizada.':
    [
      'Select a Solana account that signs messages: the connection did not provide an authorized account.',
      '请选择支持消息签名的 Solana 账户：连接未提供已授权账户。',
    ],
  'Selecione uma conversa antes de alterar os alertas.': [
    'Select a conversation before changing alerts.',
    '更改通知前请选择对话。',
  ],
  'selecione uma conversa primeiro': [
    'select a conversation first',
    '请先选择对话',
  ],
  'Selecione uma foto de até 3 MB.': [
    'Select a photo no larger than 3 MB.',
    '请选择不超过 3 MB 的图片。',
  ],
  'Selecione uma imagem estática PNG, JPEG ou WebP de até 8 MiB.': [
    'Select a static PNG, JPEG or WebP image no larger than 8 MiB.',
    '请选择不超过 8 MiB 的静态 PNG、JPEG 或 WebP 图片。',
  ],
  'Selecione uma imagem.': ['Select an image.', '请选择图片。'],
  'Sem aprovação até {0}, o vídeo deixa de ficar público e o arquivo será descartado.':
    [
      'Without approval by {0}, the video stops being public and the file will be discarded.',
      '若截至 {0} 仍未获批准，视频将不再公开，文件将被清除。',
    ],
  'Sem aprovação, o arquivo será descartado até {0}.': [
    'Without approval, the file will be discarded by {0}.',
    '若未获批准，文件将于 {0} 前清除。',
  ],
  'Sem autorização local verificada. Conecte-se para recuperar.': [
    'No verified local authorization. Connect to recover.',
    '没有已验证的本地授权。请联网以恢复。',
  ],
  'Sem autorização local verificada. Entre e recupere este aparelho.': [
    'No verified local authorization. Sign in and recover this device.',
    '没有已验证的本地授权。请登录并恢复此设备。',
  ],
  'Sem chave local deste aparelho. Faça login e recupere com autorização.': [
    'This device has no local key. Sign in and recover with authorization.',
    '此设备缺少本地密钥。请登录并通过授权恢复。',
  ],
  'Sem conexão · histórico salvo disponível neste aparelho': [
    'Offline · saved history available on this device',
    '离线 · 此设备上的已保存历史可用',
  ],
  'Sem conexão. O histórico salvo continua disponível neste aparelho.': [
    'Offline. Saved history remains available on this device.',
    '离线。此设备上的已保存历史仍可使用。',
  ],
  'Sem consentimento': ['No consent', '尚未同意'],
  'Sem conversa ainda': ['No conversations yet', '暂无对话'],
  'Sem espaço para esta menção. Remova um pouco do texto.': [
    'No space for this mention. Remove some text.',
    '没有空间添加此提及。请删减部分文字。',
  ],
  'Sem modificador': ['No modifier', '无修饰'],
  'Sem nome': ['Unnamed', '未命名'],
  'sem resposta HTTP': ['no HTTP response', '无 HTTP 响应'],
  'sem título': ['untitled', '无标题'],
  'Serviço indisponível. Tente novamente.': [
    'Service unavailable. Try again.',
    '服务不可用。请重试。',
  ],
  'Sessão alterada antes da operação.': [
    'Session changed before the operation.',
    '操作前会话已更改。',
  ],
  'Sessão alterada durante a assinatura.': [
    'Session changed during signing.',
    '签名期间会话已更改。',
  ],
  'Sessão alterada durante a conferência de identidades.': [
    'Session changed during identity verification.',
    '身份核验期间会话已更改。',
  ],
  'Sessão alterada durante a operação.': [
    'Session changed during the operation.',
    '操作期间会话已更改。',
  ],
  'Sessão alterada durante a recuperação.': [
    'Session changed during recovery.',
    '恢复期间会话已更改。',
  ],
  'Sessão alterada durante a sincronização.': [
    'Session changed during synchronization.',
    '同步期间会话已更改。',
  ],
  'Sessão alterada.': ['Session changed.', '会话已更改。'],
  'Sessão ausente.': ['Session missing.', '缺少会话。'],
  'Sessão conectada · abertura da conta em Perfil → Aparelhos': [
    'Session connected · open account in Profile → Devices',
    '会话已连接 · 请在“个人资料 → 设备”中打开账户',
  ],
  'Sessão conectada. Abra sua conta em Perfil → Aparelhos.': [
    'Session connected. Open your account in Profile → Devices.',
    '会话已连接。请在“个人资料 → 设备”中打开账户。',
  ],
  'Sessão criptográfica encerrada.': [
    'Cryptographic session ended.',
    '加密会话已结束。',
  ],
  'Sessão da chamada encerrada.': ['Call session ended.', '通话会话已结束。'],
  'Sessão da wallet inválida.': ['Invalid wallet session.', '钱包会话无效。'],
  'Sessão das DMs alterada.': ['DM session changed.', '私信会话已更改。'],
  'Sessão de outra aplicação ou rede.': [
    'Session belongs to another application or network.',
    '会话属于其他应用或网络。',
  ],
  'Sessão diverge da vinculação solicitada.': [
    'Session differs from the requested device linking.',
    '会话与请求的设备关联不一致。',
  ],
  'Sessão do status mudou ou foi encerrada.': [
    'Status session changed or ended.',
    '状态会话已更改或结束。',
  ],
  'Sessão encerrada ou login rejeitado.': [
    'Session ended or sign-in rejected.',
    '会话已结束或登录被拒绝。',
  ],
  'Sessão encerrada.': ['Session ended.', '会话已结束。'],
  'Sessão expirada. Entre novamente.': [
    'Session expired. Sign in again.',
    '会话已过期。请重新登录。',
  ],
  'Sessão indisponível.': ['Session unavailable.', '会话不可用。'],
  'Sessão ou comunidade alterada.': [
    'Session or community changed.',
    '会话或社区已更改。',
  ],
  'Sessão ou grupo alterado.': [
    'Session or group changed.',
    '会话或群组已更改。',
  ],
  'Sessão ou página alterada durante a preparação.': [
    'Session or page changed during preparation.',
    '准备期间会话或页面已更改。',
  ],
  'Sessão ou sincronização alterada.': [
    'Session or synchronization changed.',
    '会话或同步状态已更改。',
  ],
  'Sessão ou tela de status alterada.': [
    'Session or status screen changed.',
    '会话或状态页面已更改。',
  ],
  'Seu @ e sua foto nas comunidades': [
    'Your handle and photo in communities',
    '社区中的用户名与图片',
  ],
  'Seu armazenamento está próximo do limite.': [
    'Your storage is close to its limit.',
    '存储空间即将达到上限。',
  ],
  'Seu banner ficou fora do público': [
    'Your banner was withheld from public view',
    '你的横幅未公开展示',
  ],
  'Seu domínio, por exemplo carros.com': [
    'Your domain, for example cars.com',
    '你的域名，例如 cars.com',
  ],
  'Seu status': ['Your status', '你的状态'],
  'Seu status: publicar ou ver': [
    'Your status: publish or view',
    '你的状态：发布或查看',
  ],
  'Shell incompleto.': ['App shell incomplete.', '应用外壳不完整。'],
  'Siga para ativar notificações': [
    'Follow to enable notifications',
    '关注后启用通知',
  ],
  'Siga uma comunidade em Explorar para encontrá-la aqui.': [
    'Follow a community in Explore to find it here.',
    '在“探索”中关注社区，即可在此处找到。',
  ],
  'Silenciar microfone': ['Mute microphone', '将麦克风静音'],
  Símbolos: ['Symbols', '符号'],
  'Sinalização protegida indisponível.': [
    'Protected signaling unavailable.',
    '受保护信令不可用。',
  ],
  'Sincronização alterada.': ['Synchronization changed.', '同步状态已更改。'],
  'Sincronização de mensagens substituída.': [
    'Message synchronization superseded.',
    '消息同步已被替代。',
  ],
  'Sincronização do cofre das DMs não terminou.': [
    'DM vault synchronization did not finish.',
    '私信保险库同步未完成。',
  ],
  'Sincronização interrompida. Tente novamente.': [
    'Synchronization interrupted. Try again.',
    '同步已中断。请重试。',
  ],
  'Sincronização não concluída. Tente novamente.': [
    'Synchronization not completed. Try again.',
    '同步未完成。请重试。',
  ],
  'Sincronizando mensagens… O histórico abre após conferir as atualizações e exclusões.':
    [
      'Syncing messages… History opens after updates and deletions are checked.',
      '正在同步消息… 核对更新和删除记录后，历史将打开。',
    ],
  'Sincronizando…': ['Syncing…', '正在同步…'],
  'Sincronizar agora': ['Sync now', '立即同步'],
  'Sincronize antes de abrir o anexo.': [
    'Sync before opening the attachment.',
    '打开附件前请先同步。',
  ],
  'Sincronize antes de buscar; o histórico está oculto.': [
    'Sync before searching; history is hidden.',
    '搜索前请先同步；历史已隐藏。',
  ],
  'Sincronize o cofre antes de abrir preferências de conversa.': [
    'Sync the vault before opening conversation preferences.',
    '打开对话设置前请先同步保险库。',
  ],
  Sobre: ['About', '关于'],
  'Sobre e regras da comunidade': [
    'About and community rules',
    '社区介绍与规则',
  ],
  'Sobre o app': ['About the app', '关于应用'],
  Social: ['Social', '社交'],
  Solicitação: ['Request', '请求'],
  'Solicitação enviada. Aguarde o aceite.': [
    'Request sent. Wait for acceptance.',
    '请求已发送。请等待接受。',
  ],
  'Solicitação pendente cancelada.': [
    'Pending request cancelled.',
    '待处理请求已取消。',
  ],
  'Solicitação recusada. A mesma identidade não pode repetir este pedido.': [
    'Request declined. The same identity cannot repeat this request.',
    '请求已拒绝。同一身份无法重复此请求。',
  ],
  'Solicitar conversa': ['Request conversation', '申请聊天'],
  'Solicitar DM': ['Request DM', '申请私信'],
  'Som alterado na interface, mas a preferência para push não foi salva. Não é possível garantir silêncio das notificações do sistema.':
    [
      'Sound changed in the interface, but the push preference was not saved. System notification silence cannot be guaranteed.',
      '界面声音已更改，但推送设置未保存。无法保证系统通知静音。',
    ],
  'Som ativado, mas a reprodução está bloqueada pelo navegador ou sistema.': [
    'Sound enabled, but playback is blocked by the browser or system.',
    '声音已启用，但浏览器或系统阻止了播放。',
  ],
  'Som ativado, mas este navegador não conseguiu preparar o áudio.': [
    'Sound enabled, but this browser could not prepare audio.',
    '声音已启用，但此浏览器无法准备音频。',
  ],
  'Som ativado. O navegador pode aguardar um toque para liberar a reprodução.':
    [
      'Sound enabled. The browser may wait for a tap before allowing playback.',
      '声音已启用。浏览器可能需要一次点击才允许播放。',
    ],
  'Somente com meu link de convite': [
    'Only through my invitation link',
    '仅通过我的邀请链接',
  ],
  'Somente contatos já aprovados': ['Approved contacts only', '仅已批准联系人'],
  'Somente dono ou administrador pode alterar a foto.': [
    'Only the owner or administrator can change the photo.',
    '仅所有者或管理员可以更换图片。',
  ],
  'Somente o emissor registra esta autorização.': [
    'Only the issuer can register this authorization.',
    '仅签发者可以登记此授权。',
  ],
  'Somente o pacote fictício deste ensaio foi apagado.': [
    "Only this test's fictional package was deleted.",
    '仅删除了本次测试的虚构数据包。',
  ],
  'Sons ativados neste navegador.': [
    'Sounds enabled in this browser.',
    '此浏览器已启用声音。',
  ],
  'Sons desativados neste navegador.': [
    'Sounds disabled in this browser.',
    '此浏览器已关闭声音。',
  ],
  Status: ['Status', '状态'],
  'Status aberto.': ['Status opened.', '状态已打开。'],
  'Status aceita foto ou texto.': [
    'Statuses accept a photo or text.',
    '状态支持图片或文字。',
  ],
  'Status ativo': ['Active status', '有效状态'],
  'Status duram 24 horas. Seus contatos aprovados podem ver, conforme as exclusões abaixo.':
    [
      'Statuses last 24 hours. Approved contacts can see them, subject to the exclusions below.',
      '状态保留 24 小时。已批准联系人可以查看，但下方排除的联系人除外。',
    ],
  'Status excluído.': ['Status deleted.', '状态已删除。'],
  'Status expirado ou fora da audiência autorizada.': [
    'Status expired or outside the authorized audience.',
    '状态已过期或不属于获授权受众。',
  ],
  'Status mudou, expirou ou está indisponível.': [
    'Status changed, expired or unavailable.',
    '状态已更改、过期或不可用。',
  ],
  'Status publicado.': ['Status published.', '状态已发布。'],
  'Status vazio ou acima do tamanho permitido.': [
    'Status empty or exceeds the permitted size.',
    '状态为空或超过允许大小。',
  ],
  'Sua agenda está vazia. Adicione uma wallet para guardar um apelido particular.':
    [
      'Your contacts are empty. Add a wallet to save a private nickname.',
      '联系人为空。添加钱包地址以保存私密备注名。',
    ],
  'Sua avaliação deste caso': [
    'Your assessment of this case',
    '你对此案例的评估',
  ],
  'Sua conta está pronta neste aparelho.': [
    'Your account is ready on this device.',
    '你的账户已在此设备上就绪。',
  ],
  'Sua contestação': ['Your appeal', '你的申诉'],
  'Sua foto de perfil': ['Your profile photo', '你的个人资料图片'],
  'Sua foto de perfil ficou fora do público': [
    'Your profile photo was withheld from public view',
    '你的个人资料图片未公开展示',
  ],
  'Sua participação está suspensa.': [
    'Your participation is suspended.',
    '你的参与资格已暂停。',
  ],
  'Sua postagem ou resposta foi retirada do público': [
    'Your post or reply was removed from public view',
    '你的帖子或回复已从公开区域移除',
  ],
  'Sua rodada está pronta para calibração. Pode fechar esta aba; mantenha o Mac ligado e sem repouso.':
    [
      'Your round is ready for calibration. You can close this tab; keep your Mac on and awake.',
      '本轮已准备好校准。可以关闭此标签页；请保持 Mac 开机且不休眠。',
    ],
  'Suas comunidades seguidas': ['Your followed communities', '你关注的社区'],
  'Suas conversas aparecem aqui depois de adicionar um contato ou entrar em um grupo.':
    [
      'Your conversations appear here after adding a contact or joining a group.',
      '添加联系人或加入群组后，对话会显示在这里。',
    ],
  'Suas listas': ['Your lists', '你的列表'],
  'Suas postagens salvas': ['Your saved posts', '你保存的帖子'],
  'Sugestões de perfis inválidas.': [
    'Invalid profile suggestions.',
    '个人资料建议无效。',
  ],
  'Suspender participante': ['Suspend participant', '暂停成员资格'],
  Suspensa: ['Suspended', '已暂停'],
  'Tag anterior': ['Previous tag', '上一个标签'],
  'Tag anterior ou do link': [
    'Previous tag or from link',
    '之前的标签或链接中的标签',
  ],
  'Tag salva. Recarregue a comunidade para atualizar os seletores e as revisões.':
    [
      'Tag saved. Reload the community to update selectors and revisions.',
      '标签已保存。请重新加载社区以更新选择器和修订版本。',
    ],
  Tags: ['Tags', '标签'],
  'Tags (escolha de 1 a {0})': [
    'Tags (choose 1 to {0})',
    '标签（选择 1–{0} 个）',
  ],
  'Tags da comunidade': ['Community tags', '社区标签'],
  'Tags indisponíveis agora.': [
    'Tags currently unavailable.',
    '标签暂时不可用。',
  ],
  'Tamanho da mídia pública inválido.': [
    'Invalid public media size.',
    '公开媒体大小无效。',
  ],
  'Tela de avaliação indisponível.': [
    'Assessment screen unavailable.',
    '评估页面不可用。',
  ],
  'Tela de coleta indisponível.': [
    'Collection screen unavailable.',
    '采集页面不可用。',
  ],
  'Tela de ensaio incompleta.': ['Test screen incomplete.', '测试页面不完整。'],
  'Tema Azul, Preto ou Branco': [
    'Blue, Black or White theme',
    '蓝色、黑色或白色主题',
  ],
  'Tema salvo inválido. Usando Preto; escolha outro abaixo.': [
    'Invalid saved theme. Using Black; choose another below.',
    '已保存主题无效。使用黑色；可在下方选择其他主题。',
  ],
  'Tema, sons e mídias': ['Theme, sounds and media', '主题、声音与媒体'],
  'Tentar abrir novamente': ['Try opening again', '重新尝试打开'],
  'Tentar carregar imagem': ['Try loading image', '尝试加载图片'],
  'Tentar carregar preferências': ['Try loading preferences', '尝试加载设置'],
  'Tentar carregar vídeo': ['Try loading video', '尝试加载视频'],
  'Tentar novamente': ['Try again', '重试'],
  'Tentar publicação novamente': ['Retry publication', '重新尝试发布'],
  Texto: ['Text', '文字'],
  'Texto (opcional)': ['Text (optional)', '文字（选填）'],
  'Texto da resposta (opcional com mídia)': [
    'Reply text (optional with media)',
    '回复文字（含媒体时选填）',
  ],
  'Texto de DM inválido.': ['Invalid DM text.', '私信文字无效。'],
  'Texto e administração: {0} / {1} MB · mídia: {2} / {3} MB': [
    'Text and administration: {0} / {1} MB · media: {2} / {3} MB',
    '文字与管理数据：{0} / {1} MB · 媒体：{2} / {3} MB',
  ],
  'Texto fictício posterior à revogação; somente para o remetente.': [
    'Fictional text after revocation; sender only.',
    '撤销后的虚构文字；仅发送者可见。',
  ],
  'Texto histórico excedido.': [
    'Historical text exceeds the limit.',
    '历史文字超过限制。',
  ],
  'Texto vazio ou excedido.': [
    'Text empty or over the limit.',
    '文字为空或超过限制。',
  ],
  'Tipo de assinatura inválido.': ['Invalid signature type.', '签名类型无效。'],
  'Tipo de foto inválido.': ['Invalid photo type.', '图片类型无效。'],
  'Tipo de mensagem inválido.': ['Invalid message type.', '消息类型无效。'],
  'Tipo de registro de backup não suportado.': [
    'Unsupported backup record type.',
    '不支持此备份记录类型。',
  ],
  'Tipo de status inválido.': ['Invalid status type.', '状态类型无效。'],
  'Tipo: TXT\nNome: {0}\nValor: {1}\nPublique e verifique antes de {2}.': [
    'Type: TXT\nName: {0}\nValue: {1}\nPublish and verify before {2}.',
    '类型：TXT\n名称：{0}\n值：{1}\n请在 {2} 前发布并验证。',
  ],
  Título: ['Title', '标题'],
  'Todas as mensagens @ e pedidos': [
    'All handle messages and requests',
    '全部用户名私信与请求',
  ],
  'Todas as tags': ['All tags', '全部标签'],
  'Todo o histórico': ['All history', '全部历史'],
  'Todos os tons': ['All skin tones', '全部肤色'],
  'Toque em Abrir {0}, conecte e assine. Depois volte a este navegador para confirmar o endereço.':
    [
      'Tap Open {0}, connect and sign. Return to this browser to confirm the address.',
      '请点击“打开 {0}”，连接并签名。然后返回此浏览器确认地址。',
    ],
  'Tornar administrador': ['Make administrator', '设为管理员'],
  'Tornar membro': ['Make member', '设为普通成员'],
  'Transferência aguardando @{0}.': [
    'Transfer awaiting @{0}.',
    '转让等待 @{0} 接受。',
  ],
  'Transferência de comunidade aguardando você': [
    'Community transfer awaiting you',
    '社区转让等待你接受',
  ],
  'Transferência oferecida. A propriedade muda após o aceite do membro escolhido.':
    [
      'Transfer offered. Ownership changes after the selected member accepts.',
      '已提出转让。所选成员接受后，所有权将更改。',
    ],
  'Transferência para você': ['Transfer to you', '向你转让'],
  Transferências: ['Transfers', '转让'],
  'Transferências de comunidade': ['Community transfers', '社区转让'],
  'Transferências de comunidades': ['Community transfers', '社区转让'],
  Trending: ['Trending', '热门'],
  'Trocar banner': ['Change banner', '更换横幅'],
  'Trocar convite': ['Replace invitation', '更换邀请'],
  'Trocar foto': ['Change photo', '更换图片'],
  Tudo: ['All', '全部'],
  'Tudo ligado: online, leitura, GIFs e avisos completos.': [
    'Everything on: online status, read receipts, GIFs and full alerts.',
    '全部开启：在线状态、已读回执、GIF 和完整通知。',
  ],
  'TURN inválido.': ['Invalid TURN.', 'TURN 无效。'],
  'TURN não respondeu a tempo.': [
    'TURN did not respond in time.',
    'TURN 未及时响应。',
  ],
  'TURN próprio indisponível.': [
    "App's own TURN server unavailable.",
    '应用自有 TURN 服务器不可用。',
  ],
  'TXT: _0xdmme.{0}\nValor: {1}': [
    'TXT: _0xdmme.{0}\nValue: {1}',
    'TXT: _0xdmme.{0}\n值：{1}',
  ],
  'Um contato ainda precisa abrir as Conversas para preparar sua conta.': [
    'A contact still needs to open Conversations to prepare their account.',
    '有联系人仍需打开“对话”以准备账户。',
  ],
  'Uma contestação por sanção, visível aos gestores.': [
    'One appeal per sanction, visible to managers.',
    '每项处罚可申诉一次，管理员可见。',
  ],
  'Upload de vídeo ainda não está disponível.': [
    'Video upload is not available yet.',
    '视频上传尚不可用。',
  ],
  'upvotes em alta': ['trending upvotes', '点赞趋势上升'],
  'Use este QR ou código somente no seu outro aparelho.': [
    'Use this QR code or code only on your other device.',
    '请仅在你自己的另一台设备上使用此二维码或代码。',
  ],
  'Use PNG, JPEG ou WebP de até 8 MiB por imagem.': [
    'Use PNG, JPEG or WebP images no larger than 8 MiB each.',
    '请使用每张不超过 8 MiB 的 PNG、JPEG 或 WebP 图片。',
  ],
  'Use um aparelho autorizado para aprovar.': [
    'Use an authorized device to approve.',
    '请使用已授权设备批准。',
  ],
  'Use uma foto PNG, JPEG ou WebP válida.': [
    'Use a valid PNG, JPEG or WebP photo.',
    '请使用有效的 PNG、JPEG 或 WebP 图片。',
  ],
  'Use uma imagem PNG, JPEG ou WebP compatível nesta DM.': [
    'Use a compatible PNG, JPEG or WebP image in this DM.',
    '请在此私信中使用兼容的 PNG、JPEG 或 WebP 图片。',
  ],
  'Uso do armazenamento, salvar e restaurar': [
    'Storage usage, save and restore',
    '存储用量、保存与恢复',
  ],
  Usuário: ['User', '用户'],
  Usuários: ['Users', '用户'],
  'Usuários e comunidades': ['Users and communities', '用户与社区'],
  'Válida até': ['Valid until', '有效期至'],
  'Validando e importando o histórico cifrado…': [
    'Validating and importing encrypted history…',
    '正在验证并导入加密历史…',
  ],
  Ver: ['View', '查看'],
  'Ver a lista das {0} comunidades': [
    'View the list of {0} communities',
    '查看 {0} 个社区列表',
  ],
  'Ver análise e contestar': ['View analysis and appeal', '查看分析并申诉'],
  'Ver imagem original': ['View original image', '查看原始图片'],
  'Ver mais': ['View more', '查看更多'],
  'Ver menos': ['View less', '收起'],
  'Ver minha mídia preparada (restrita)': [
    'View my prepared media (restricted)',
    '查看我的已处理媒体（受限）',
  ],
  'Ver nomes': ['View names', '查看名称'],
  'Todas as mensagens @': ['All handle messages', '全部用户名私信'],
  'Conversa de DM não confirmada.': [
    'DM conversation not confirmed.',
    '私信会话尚未确认。',
  ],
  'Solicitações de DM foram desativadas. Use Bloquear para impedir mensagens.':
    [
      'DM requests have been disabled. Use Block to prevent messages.',
      '私信申请已停用。请使用屏蔽来阻止消息。',
    ],
  'Ver outros comentários': ['View other comments', '查看其他评论'],
  'Ver perfil público': ['View public profile', '查看公开个人资料'],
  'Ver postagem completa': ['View full post', '查看完整帖子'],
  'Ver resposta publicada': ['View published reply', '查看已发布回复'],
  'Ver seguidores em comum': ['View mutual followers', '查看共同关注者'],
  'Ver status de {0}': ["View {0}'s status", '查看 {0} 的状态'],
  'Ver tudo': ['View all', '查看全部'],
  'verificação de domínio desatualizada ou inconclusiva': [
    'domain verification outdated or inconclusive',
    '域名验证已过时或结果不确定',
  ],
  'Verificação de recuperação falhou.': [
    'Recovery verification failed.',
    '恢复验证失败。',
  ],
  'Verificar autorização': ['Verify authorization', '核验授权'],
  'Verificar DNS': ['Verify DNS', '验证 DNS'],
  'Verifique novamente antes de usar esta autorização.': [
    'Verify again before using this authorization.',
    '使用此授权前请重新核验。',
  ],
  'Versão anterior inválida para esta edição.': [
    'Previous version invalid for this edit.',
    '先前版本不适用于此次编辑。',
  ],
  'Versão ausente.': ['Version missing.', '缺少版本。'],
  'Versão de contato não carregada.': [
    'Contact version not loaded.',
    '联系人版本未加载。',
  ],
  'Versão do ensaio inválida.': ['Invalid test version.', '测试版本无效。'],
  'Versão removida do cofre pessoal. Consulte o backup independente.': [
    'Version removed from the personal vault. Check the independent backup.',
    '版本已从个人保险库中移除。请查阅独立备份。',
  ],
  'Versão, atualizações, código e licenças': [
    'Version, updates, source code and licenses',
    '版本、更新、源代码与许可证',
  ],
  'Versões carregadas: {0}': ['Loaded versions: {0}', '已加载版本：{0}'],
  'Viagens e lugares': ['Travel and places', '旅行与地点'],
  'Vídeo do YouTube': ['YouTube video', 'YouTube 视频'],
  'Vídeo enviado. Análise em segundo plano pendente.': [
    'Video uploaded. Background analysis pending.',
    '视频已上传。等待后台分析。',
  ],
  'Vídeo indisponível. Tente novamente.': [
    'Video unavailable. Try again.',
    '视频不可用。请重试。',
  ],
  'Vigente — aceite verificado': [
    'Active — acceptance verified',
    '有效 — 已核验接受记录',
  ],
  'Vigente — aguardando aceite': [
    'Active — awaiting acceptance',
    '有效 — 等待接受',
  ],
  'Vincular, recuperar e gerenciar acessos': [
    'Link, recover and manage access',
    '关联、恢复与管理访问',
  ],
  'Vincular/verificar domínio (opcional)': [
    'Link/verify domain (optional)',
    '关联/验证域名（选填）',
  ],
  'Vínculo do aparelho ausente.': ['Device binding missing.', '缺少设备绑定。'],
  'Vínculo do domínio divergente.': [
    'Domain binding does not match.',
    '域名绑定不匹配。',
  ],
  'Vínculo Matrix ausente.': ['Matrix binding missing.', '缺少 Matrix 绑定。'],
  'Vínculos de chaves ausentes.': ['Key bindings missing.', '缺少密钥绑定。'],
  'Vínculos de grupo ausentes.': ['Group bindings missing.', '缺少群组绑定。'],
  'Visão geral': ['Overview', '概览'],
  'Visibilidade aplicada no servidor. Contatos já aprovados foram preservados.':
    [
      'Visibility applied on the server. Previously approved contacts were preserved.',
      '可见性已在服务器上应用。先前已批准联系人已保留。',
    ],
  'Vista pelos destinatários com confirmação de leitura': [
    'Seen by recipients who share read receipts',
    '已由开启已读回执的接收者查看',
  ],
  visualizações: ['views', '次浏览'],
  Você: ['You', '你'],
  'Você ainda não criou um perfil público.': [
    'You have not created a public profile yet.',
    '你尚未创建公开个人资料。',
  ],
  'Você entrou no grupo.': ['You joined the group.', '你已加入群组。'],
  'Você está {0} seus dados com {1}. Confirme somente o pedido que abriu no seu navegador. Depois volte a ele.':
    [
      'You are {0} your data with {1}. Only confirm the request you opened in your browser. Then return to it.',
      '你正在使用 {1} {0}你的数据。请仅确认自己在浏览器中发起的请求，然后返回该浏览器。',
    ],
  'Você não pode postar nesta comunidade. Confira se ela está arquivada ou se há uma restrição à sua participação.':
    [
      'You cannot post in this community. Check whether it is archived or your participation is restricted.',
      '你无法在此社区发帖。请检查社区是否已归档，或你的参与资格是否受限。',
    ],
  'Você não tem pedidos enviados nesta página.': [
    'You have no sent requests on this page.',
    '此页面没有你发送的请求。',
  ],
  Voltar: ['Back', '返回'],
  'Voltar à Atividade': ['Back to Activity', '返回活动'],
  'Voltar ao início': ['Back to start', '返回开始'],
  'Votação indisponível nesta comunidade.': [
    'Voting unavailable in this community.',
    '此社区无法投票。',
  ],
  'Votar a favor; tocar novamente retira o voto': [
    'Upvote; tap again to remove your vote',
    '点赞；再次点击撤回',
  ],
  'Votar contra; tocar novamente retira o voto': [
    'Downvote; tap again to remove your vote',
    '点踩；再次点击撤回',
  ],
  'Votos da postagem': ['Post votes', '帖子投票'],
  'Wallet {0}: {1}': ['Wallet {0}: {1}', '钱包 {0}：{1}'],
  'Wallet {0}: {1}{2}{3}': ['Wallet {0}: {1}{2}{3}', '钱包 {0}：{1}{2}{3}'],
  'Wallet ainda não carregada na lista.': [
    'Wallet not loaded in the list yet.',
    '钱包尚未加载到列表中。',
  ],
  'Wallet alterada.': ['Wallet changed.', '钱包已更改。'],
  'Wallet bloqueada': ['Blocked wallet', '已屏蔽钱包'],
  'Wallet copiada.': ['Wallet address copied.', '钱包地址已复制。'],
  'Wallet e nome informado': ['Wallet and provided name', '钱包与提供的名称'],
  'Wallet indisponível neste navegador. Abra uma wallet compatível para assinar.':
    [
      'Wallet unavailable in this browser. Open a compatible wallet to sign.',
      '此浏览器中的钱包不可用。请打开兼容钱包以签名。',
    ],
  'Wallet indisponível para solicitação por endereço. Salve na agenda e compartilhe seu convite.':
    [
      'Wallet unavailable for requests by address. Save it in contacts and share your invitation.',
      '无法按此钱包地址申请聊天。请保存到联系人并分享邀请。',
    ],
  'Wallet indisponível.': ['Wallet unavailable.', '钱包不可用。'],
  'Wallet não disponível neste navegador interno. Abra novamente o pedido no navegador original.':
    [
      'Wallet unavailable in this in-app browser. Reopen the request in the original browser.',
      '此内置浏览器中的钱包不可用。请在原浏览器中重新打开请求。',
    ],
  'Wallet não disponível.': ['Wallet unavailable.', '钱包不可用。'],
  'Wallet selecionada mudou. Confira a conta de origem do pacote ativo e teste novamente.':
    [
      "Selected wallet changed. Check the active package's source account and test again.",
      '所选钱包已更改。请核对当前数据包的来源账户并重新测试。',
    ],
  'Wallet sem a capacidade necessária.': [
    'Wallet lacks the required capability.',
    '钱包不支持所需功能。',
  ],
  'WASM incompatível': ['Incompatible WASM', 'WASM 不兼容'],
  'Worker indisponível neste navegador.': [
    'Worker unavailable in this browser.',
    '此浏览器中的工作线程不可用。',
  ],
  'Idioma do aplicativo': ['App language', '应用语言'],
  'Salvar idioma': ['Save language', '保存语言'],
  'Não foi possível salvar o idioma.': [
    'Could not save your language.',
    '无法保存语言设置。',
  ],
  'Abra sua conta para salvar o idioma.': [
    'Open your account to save your language.',
    '请打开账户以保存语言设置。',
  ],
  'Invalid language preference.': [
    'Invalid language preference.',
    '语言设置无效。',
  ],
  'html.7eb60c98aba6': [
    '<article class="card"><h2>Presence and read receipts</h2><form data-privacy-preferences><label><input type="checkbox" name="online"> Show online status to approved contacts</label><label><input type="checkbox" name="readReceipts"> Send read receipts</label><p>These choices apply to your account. Confirm to apply them.</p><button class="primary" type="submit">Confirm changes</button></form><p data-privacy-status role="status"></p></article>',
    '<article class="card"><h2>在线状态与已读回执</h2><form data-privacy-preferences><label><input type="checkbox" name="online"> 向已批准联系人显示在线状态</label><label><input type="checkbox" name="readReceipts"> 发送已读回执</label><p>这些选项适用于你的账户。请确认以应用。</p><button class="primary" type="submit">确认更改</button></form><p data-privacy-status role="status"></p></article>',
  ],
  'html.6c0fbe0bf86d': [
    '<article class="card account-card"><span class="eyebrow">WALLET ACCOUNT</span><h2 data-account-title>Your profile on 0xDMme</h2>\n<p data-account-intro>Sign in with your wallet or link this device in Profile → Devices. Access signatures do not move funds.</p>\n<button class="primary" type="button" data-wallet-approve hidden>Confirm signature</button>\n<button class="primary" type="button" data-wallet-picker-toggle aria-expanded="false" aria-controls="wallet-picker">Connect wallet</button>\n<section id="wallet-picker" class="wallet-picker" data-wallet-picker hidden aria-label="Choose wallet">\n<div data-wallet-brands><h3>Choose your wallet</h3><p class="detail">Detection indicates availability in this browser. In mobile Chrome/Safari, choose the app you installed; it may not be detected here.</p>\n<div class="wallet-options"><button type="button" class="wallet-option" data-wallet-brand="MetaMask"><span>MetaMask</span><span class="wallet-detection" data-brand-detection="MetaMask">Not detected</span></button>\n<button type="button" class="wallet-option" data-wallet-brand="Phantom"><span>Phantom</span><span class="wallet-detection" data-brand-detection="Phantom">Not detected</span></button>\n<button type="button" class="wallet-option" data-wallet-brand="Backpack"><span>Backpack</span><span class="wallet-detection" data-brand-detection="Backpack">Not detected</span></button></div>\n<div data-other-wallets class="wallet-options"></div></div>\n<div data-wallet-networks hidden><button type="button" data-wallet-picker-back>← Change wallet</button><h3 data-wallet-network-title></h3><p class="detail">Choose the account\'s ecosystem.</p>\n<div class="wallet-options"><button type="button" class="wallet-option" data-wallet="MetaMask" data-network-brand="MetaMask"><span>EVM</span><span class="wallet-detection" data-detection="MetaMask">Not detected</span></button>\n<button type="button" class="wallet-option" data-wallet="MetaMask:solana" data-network-brand="MetaMask"><span>Solana</span><span class="wallet-detection" data-detection="MetaMask:solana">Not detected</span></button>\n<button type="button" class="wallet-option" data-wallet="Phantom" data-network-brand="Phantom"><span>EVM</span><span class="wallet-detection" data-detection="Phantom">Not detected</span></button>\n<button type="button" class="wallet-option" data-wallet="Phantom:solana" data-network-brand="Phantom"><span>Solana</span><span class="wallet-detection" data-detection="Phantom:solana">Not detected</span></button>\n<button type="button" class="wallet-option" data-wallet="Backpack:solana" data-network-brand="Backpack"><span>Solana</span><span class="wallet-detection" data-detection="Backpack:solana">Not detected</span></button>\n<button type="button" class="wallet-option" data-wallet="Backpack" data-network-brand="Backpack"><span>EVM</span><span class="wallet-detection" data-detection="Backpack">Not detected</span></button></div>\n<div data-other-wallet-networks class="wallet-options"></div></div>\n<p class="detail">On mobile, selecting an ecosystem attempts to open your wallet for signing. Return to this browser to confirm the address. EVM and Solana are separate accounts.</p></section>\n<p data-wallet-purpose hidden>Only sign if you opened this request in your browser. It will connect that browser to your account; reject links sent by other people.</p>\n<div data-wallet-return hidden><a data-wallet-open referrerpolicy="no-referrer">Open wallet</a><p data-wallet-candidate></p><button data-wallet-confirm type="button" hidden>Confirm this address in this browser</button><button data-wallet-cancel type="button">Cancel request</button></div>\n<p class="detail" data-wallet-manual hidden>Use your phone\'s recent apps screen to return to the original browser. The request is only confirmed as signed when this page says so.</p>\n<p data-account-status role="status">Checking session…</p><button data-account-finish type="button" hidden>Complete sign-in</button>\n<details data-wallet-diagnostics hidden open><summary>Sign-in diagnostics</summary><p class="detail" data-wallet-diagnostic></p><p class="detail">If it fails, send this line. It contains no ticket, address or signature.</p></details>\n<div data-profile hidden><div class="profile-identity"><button class="profile-avatar" data-profile-avatar type="button" aria-label="Change profile photo">#</button><div><strong data-profile-name></strong><p data-account-address class="account-address"></p><div class="settings-actions"><button data-profile-copy type="button">Copy wallet</button><button data-logout type="button" aria-label="Sign out">Sign out</button></div></div></div>\n<details class="settings-section" data-settings-section="account"><summary><span class="settings-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m4 16 12-12 4 4-12 12H4zM13 7l4 4"/></svg></span><span><strong>Edit profile</strong><small>Name, photo and backup reminder</small></span><span class="settings-chevron" aria-hidden="true">⌄</span></summary><div class="settings-body">\n<form data-name-form><label>Name shown in contact requests<input name="display-name" maxlength="80" autocomplete="nickname"></label><button class="primary" type="submit">Confirm changes</button></form>\n<div data-private-profile hidden><p data-photo-draft-status></p><button type="button" data-private-photo-remove>Remove photo</button><h3>Preferences</h3>\n<form data-preferences><label><input type="checkbox" name="backupReminder"> Remind me to save a backup every seven days</label><button class="primary" type="submit">Confirm changes</button></form></div>\n</div></details><p data-profile-status role="status"></p></div></article>',
    '<article class="card account-card"><span class="eyebrow">钱包账户</span><h2 data-account-title>你的 0xDMme 个人资料</h2>\n<p data-account-intro>请使用钱包登录，或在“个人资料 → 设备”中关联此设备。访问签名不会转移资金。</p>\n<button class="primary" type="button" data-wallet-approve hidden>确认签名</button>\n<button class="primary" type="button" data-wallet-picker-toggle aria-expanded="false" aria-controls="wallet-picker">连接钱包</button>\n<section id="wallet-picker" class="wallet-picker" data-wallet-picker hidden aria-label="选择钱包">\n<div data-wallet-brands><h3>选择钱包</h3><p class="detail">检测结果仅表示钱包在此浏览器中可用。在手机 Chrome/Safari 中，请选择你已安装的应用；这里可能无法检测到它。</p>\n<div class="wallet-options"><button type="button" class="wallet-option" data-wallet-brand="MetaMask"><span>MetaMask</span><span class="wallet-detection" data-brand-detection="MetaMask">未检测到</span></button>\n<button type="button" class="wallet-option" data-wallet-brand="Phantom"><span>Phantom</span><span class="wallet-detection" data-brand-detection="Phantom">未检测到</span></button>\n<button type="button" class="wallet-option" data-wallet-brand="Backpack"><span>Backpack</span><span class="wallet-detection" data-brand-detection="Backpack">未检测到</span></button></div>\n<div data-other-wallets class="wallet-options"></div></div>\n<div data-wallet-networks hidden><button type="button" data-wallet-picker-back>← 更换钱包</button><h3 data-wallet-network-title></h3><p class="detail">请选择账户生态系统。</p>\n<div class="wallet-options"><button type="button" class="wallet-option" data-wallet="MetaMask" data-network-brand="MetaMask"><span>EVM</span><span class="wallet-detection" data-detection="MetaMask">未检测到</span></button>\n<button type="button" class="wallet-option" data-wallet="MetaMask:solana" data-network-brand="MetaMask"><span>Solana</span><span class="wallet-detection" data-detection="MetaMask:solana">未检测到</span></button>\n<button type="button" class="wallet-option" data-wallet="Phantom" data-network-brand="Phantom"><span>EVM</span><span class="wallet-detection" data-detection="Phantom">未检测到</span></button>\n<button type="button" class="wallet-option" data-wallet="Phantom:solana" data-network-brand="Phantom"><span>Solana</span><span class="wallet-detection" data-detection="Phantom:solana">未检测到</span></button>\n<button type="button" class="wallet-option" data-wallet="Backpack:solana" data-network-brand="Backpack"><span>Solana</span><span class="wallet-detection" data-detection="Backpack:solana">未检测到</span></button>\n<button type="button" class="wallet-option" data-wallet="Backpack" data-network-brand="Backpack"><span>EVM</span><span class="wallet-detection" data-detection="Backpack">未检测到</span></button></div>\n<div data-other-wallet-networks class="wallet-options"></div></div>\n<p class="detail">在手机上选择生态系统后，会尝试打开钱包以签名。请返回此浏览器确认地址。EVM 和 Solana 使用不同账户。</p></section>\n<p data-wallet-purpose hidden>请仅在你自己于浏览器中发起此请求时签名。签名会将该浏览器连接到你的账户；请拒绝他人发来的链接。</p>\n<div data-wallet-return hidden><a data-wallet-open referrerpolicy="no-referrer">打开钱包</a><p data-wallet-candidate></p><button data-wallet-confirm type="button" hidden>在此浏览器中确认此地址</button><button data-wallet-cancel type="button">取消请求</button></div>\n<p class="detail" data-wallet-manual hidden>请通过手机最近使用的应用界面返回原浏览器。只有此页面显示已确认时，才表示请求签名完成。</p>\n<p data-account-status role="status">正在检查会话…</p><button data-account-finish type="button" hidden>完成登录</button>\n<details data-wallet-diagnostics hidden open><summary>登录诊断</summary><p class="detail" data-wallet-diagnostic></p><p class="detail">如果失败，请发送此行。它不包含请求凭证、地址或签名。</p></details>\n<div data-profile hidden><div class="profile-identity"><button class="profile-avatar" data-profile-avatar type="button" aria-label="更换个人资料图片">#</button><div><strong data-profile-name></strong><p data-account-address class="account-address"></p><div class="settings-actions"><button data-profile-copy type="button">复制钱包地址</button><button data-logout type="button" aria-label="退出登录">退出登录</button></div></div></div>\n<details class="settings-section" data-settings-section="account"><summary><span class="settings-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m4 16 12-12 4 4-12 12H4zM13 7l4 4"/></svg></span><span><strong>编辑个人资料</strong><small>名称、图片与备份提醒</small></span><span class="settings-chevron" aria-hidden="true">⌄</span></summary><div class="settings-body">\n<form data-name-form><label>联系人请求中显示的名称<input name="display-name" maxlength="80" autocomplete="nickname"></label><button class="primary" type="submit">确认更改</button></form>\n<div data-private-profile hidden><p data-photo-draft-status></p><button type="button" data-private-photo-remove>移除图片</button><h3>偏好设置</h3>\n<form data-preferences><label><input type="checkbox" name="backupReminder"> 每七天提醒保存备份</label><button class="primary" type="submit">确认更改</button></form></div>\n</div></details><p data-profile-status role="status"></p></div></article>',
  ],
  'html.5ee9df8dde64': [
    '<h2>Notifications on this device</h2><p>Your account receives push notifications. Enable them here too for message and call alerts.</p><p data-push-offer-status role="status"></p><div class="settings-actions"><button type="button" data-push-offer-later>Not now</button><button type="button" class="primary" data-push-offer-enable>Enable notifications</button></div>',
    '<h2>此设备上的通知</h2><p>你的账户已接收推送通知。请在此设备上也启用，以接收消息与来电通知。</p><p data-push-offer-status role="status"></p><div class="settings-actions"><button type="button" data-push-offer-later>暂时跳过</button><button type="button" class="primary" data-push-offer-enable>启用通知</button></div>',
  ],
  'html.91580e468fc5': [
    '<section data-wizard-step="result" hidden><h2>Initial settings</h2><p data-wizard-result role="status"></p><ul data-wizard-problems></ul><div class="settings-actions"><button type="button" class="primary" data-wizard-close>Close</button></div></section>',
    '<section data-wizard-step="result" hidden><h2>初始设置</h2><p data-wizard-result role="status"></p><ul data-wizard-problems></ul><div class="settings-actions"><button type="button" class="primary" data-wizard-close>关闭</button></div></section>',
  ],
  'html.0930613867e2': [
    '<form data-wizard-step="review" hidden><h2>Review your settings</h2><p>Applies to your account on all devices.</p>\n<fieldset><legend>Appearance</legend><div class="settings-pack-themes">{0}</div></fieldset>\n<fieldset><legend>Privacy</legend><label>Who can request a conversation<select name="discovery">{1}</select></label><label><input type="checkbox" name="online"> Show online status to approved contacts</label><label><input type="checkbox" name="readReceipts"> Send read receipts</label></fieldset>\n<fieldset><legend>External media</legend><label><input type="checkbox" name="externalMedia"> Show GIFs and external videos</label><small data-wizard-media></small></fieldset>\n<fieldset><legend>Notifications</legend><label><input type="checkbox" name="pushEnabled"> Receive push notifications</label><div class="settings-pack-push"><label><input type="checkbox" name="messages"> Messages and replies</label><label><input type="checkbox" name="calls"> Calls</label><label><input type="checkbox" name="showCalls"> Identify the alert as a voice call</label></div><small>When saving, your browser asks for notification permission. The contact\'s name is never shown.</small><label><input type="checkbox" name="sound"> In-app sounds</label></fieldset>\n<fieldset><legend>Backup</legend><label><input type="checkbox" name="backupReminder"> Remind me to save a backup every seven days</label></fieldset>\n<div class="settings-actions"><button type="button" data-wizard-back>Back</button><button type="submit" class="primary">Save and get started</button></div></form>',
    '<form data-wizard-step="review" hidden><h2>检查设置</h2><p>适用于你账户的所有设备。</p>\n<fieldset><legend>外观</legend><div class="settings-pack-themes">{0}</div></fieldset>\n<fieldset><legend>隐私</legend><label>谁可以申请聊天<select name="discovery">{1}</select></label><label><input type="checkbox" name="online"> 向已批准联系人显示在线状态</label><label><input type="checkbox" name="readReceipts"> 发送已读回执</label></fieldset>\n<fieldset><legend>外部媒体</legend><label><input type="checkbox" name="externalMedia"> 显示 GIF 和外部视频</label><small data-wizard-media></small></fieldset>\n<fieldset><legend>通知</legend><label><input type="checkbox" name="pushEnabled"> 接收推送通知</label><div class="settings-pack-push"><label><input type="checkbox" name="messages"> 消息与回复</label><label><input type="checkbox" name="calls"> 通话</label><label><input type="checkbox" name="showCalls"> 将通知标识为语音来电</label></div><small>保存时，浏览器会请求通知权限。通知不会显示联系人的姓名。</small><label><input type="checkbox" name="sound"> 应用内声音</label></fieldset>\n<fieldset><legend>备份</legend><label><input type="checkbox" name="backupReminder"> 每七天提醒保存备份</label></fieldset>\n<div class="settings-actions"><button type="button" data-wizard-back>返回</button><button type="submit" class="primary">保存并开始</button></div></form>',
  ],
  'html.12c90e74741c': [
    '<section data-wizard-step="choose"><h2>Initial settings</h2><p>Choose a starting point. Review every option before saving; you can change everything later in Profile.</p><div class="settings-pack-presets">{0}</div><div class="settings-actions"><button type="button" data-wizard-skip>Not now</button></div></section>',
    '<section data-wizard-step="choose"><h2>初始设置</h2><p>选择一组初始设置。保存前可逐项检查，之后可在“个人资料”中更改所有设置。</p><div class="settings-pack-presets">{0}</div><div class="settings-actions"><button type="button" data-wizard-skip>暂时跳过</button></div></section>',
  ],
  ' ocultada pela moderação.': [' hidden by moderation.', ' 已被审核隐藏。'],
  ' excluída pelo autor.': [' deleted by the author.', ' 已被作者删除。'],
  'html.6b9c4f752db1': [
    '<div class="public-chat-bar"><span>Message via @</span><button data-chat-collapse class="icon-button" type="button" aria-label="Collapse conversation" title="Collapse conversation"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H9M13 7l-5 5 5 5M4 5v14"/></svg></button></div><div class="public-chat-body"></div>',
    '<div class="public-chat-bar"><span>通过 @ 发送消息</span><button data-chat-collapse class="icon-button" type="button" aria-label="收起对话" title="收起对话"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H9M13 7l-5 5 5 5M4 5v14"/></svg></button></div><div class="public-chat-body"></div>',
  ],
  'html.148d3089e900': [
    '<section class="profile-settings" aria-label="Account settings"><h2>Settings</h2><p class="settings-intro">Open the category you want to adjust.</p>\n{0}\n{1}\n{2}\n{3}\n{4}\n{5}\n{6}\n{7}\n<div class="profile-content-links"><button type="button" data-open-section="account">Edit profile</button><a href="#status">My status</a><a href="#contacts">Contacts</a></div></section>',
    '<section class="profile-settings" aria-label="账户设置"><h2>设置</h2><p class="settings-intro">打开需要调整的设置类别。</p>\n{0}\n{1}\n{2}\n{3}\n{4}\n{5}\n{6}\n{7}\n<div class="profile-content-links"><button type="button" data-open-section="account">编辑个人资料</button><a href="#status">我的状态</a><a href="#contacts">联系人</a></div></section>',
  ],
  'html.33d7dbf67efc': [
    '<article class="card"><p id="pwa-state" role="status">Checking for updates…</p><button id="check-updates" type="button">Check for updates</button></article><nav class="about-app-links" aria-label="Source code and licenses" data-about-links></nav>',
    '<article class="card"><p id="pwa-state" role="status">正在检查更新…</p><button id="check-updates" type="button">检查更新</button></article><nav class="about-app-links" aria-label="源代码与许可证" data-about-links></nav>',
  ],
  'html.422549a13d64': [
    '<fieldset class="appearance-options"><legend>Theme</legend>{0}</fieldset><p class="appearance-feedback" role="status"></p><p class="settings-test-note">When signed in, the theme follows your account across devices.</p>',
    '<fieldset class="appearance-options"><legend>主题</legend>{0}</fieldset><p class="appearance-feedback" role="status"></p><p class="settings-test-note">登录后，主题将随账户同步到各设备。</p>',
  ],
  'html.eedc51d31423': [
    '<article class="card"><h2>Local backup</h2><p>Keep a full encrypted copy. Importing a file adds its history to this device\'s conversations.</p><p data-backup-status role="status"></p><button data-backup-save class="primary" type="button">Save backup file</button><a data-backup-download hidden>Download prepared file</a><button data-backup-validate type="button">Validate file</button><input data-backup-file type="file" accept=".0xdm,application/octet-stream" hidden><button data-backup-cancel type="button" hidden>Cancel</button><section class="settings-danger"><h3>Danger zone</h3><p>Available after you validate a backup file: removes from your server vault only what that file preserves, after confirmation. Later messages and other people\'s copies remain.</p><button data-backup-clean type="button" disabled>Reset vault</button></section></article>',
    '<article class="card"><h2>本地备份</h2><p>保留完整的加密副本。导入文件会将历史加入此设备的对话中。</p><p data-backup-status role="status"></p><button data-backup-save class="primary" type="button">保存备份文件</button><a data-backup-download hidden>下载已处理文件</a><button data-backup-validate type="button">验证文件</button><input data-backup-file type="file" accept=".0xdm,application/octet-stream" hidden><button data-backup-cancel type="button" hidden>取消</button><section class="settings-danger"><h3>危险操作</h3><p>验证备份文件后可用：确认后，仅从服务器保险库中移除该文件已保存的内容。之后的消息和其他人的副本会保留。</p><button data-backup-clean type="button" disabled>重置保险库</button></section></article>',
  ],
  'html.dc84c57fff55': [
    '<article class="card call-settings"><h2>Voice calls</h2><p>Receive calls from approved contacts while the app is open and connected. Muted or archived conversations do not ring. No call history is kept.</p><button data-call-toggle type="button" aria-pressed="true">Disable incoming calls</button><p data-call-status role="status"></p></article>',
    '<article class="card call-settings"><h2>语音通话</h2><p>应用打开并联网时，可以接听已批准联系人的来电。静音或归档对话不会响铃。不会保留通话历史。</p><button data-call-toggle type="button" aria-pressed="true">关闭来电</button><p data-call-status role="status"></p></article>',
  ],
  'html.46729037ae98': [
    '<form data-{0} class="chat-composer">\n    {1}\n    <div class="compose-preview"><div data-attachment-preview></div><button data-attachment-clear class="chat-icon" type="button" aria-label="Remove attachment" title="Remove attachment" hidden>{2}</button></div>\n    <p data-voice-status class="compose-notice" role="status"></p>\n    <div class="voice-recorder"><button data-voice-cancel class="chat-icon" type="button" aria-label="Cancel recording" title="Cancel recording" hidden>{3}</button><span class="voice-rec-dot" aria-hidden="true"></span><span data-voice-clock class="voice-rec-clock">0:00</span><span class="voice-rec-limit">/ 1:30</span><span class="voice-rec-hint">Release to review</span><button data-voice-stop class="chat-icon compose-primary" type="button" aria-label="Stop and review" title="Stop and review" hidden>{4}</button></div>\n    <div class="compose-row">\n      <div class="compose-input">\n        <button data-{5}-emoji class="chat-icon" type="button" aria-label="Choose emoji" title="Choose emoji">{6}</button>\n        <textarea data-{7}-text rows="1" aria-label="Message" placeholder="Message…"></textarea>\n        <button data-chat-attachment type="button" class="chat-icon" aria-label="Attach photo or file" title="{11}">{8}</button>\n      </div>\n      <button data-voice-record class="chat-icon compose-primary" type="button" aria-label="Record voice message" title="Record voice">{9}</button>\n      <button data-compose-send class="chat-icon compose-primary" type="submit" aria-label="Send message" title="Send" hidden>{10}</button>\n    </div>\n    <input data-attachment-file type="file" aria-label="Photo or file" hidden>\n  </form>',
    '<form data-{0} class="chat-composer">\n    {1}\n    <div class="compose-preview"><div data-attachment-preview></div><button data-attachment-clear class="chat-icon" type="button" aria-label="移除附件" title="移除附件" hidden>{2}</button></div>\n    <p data-voice-status class="compose-notice" role="status"></p>\n    <div class="voice-recorder"><button data-voice-cancel class="chat-icon" type="button" aria-label="取消录音" title="取消录音" hidden>{3}</button><span class="voice-rec-dot" aria-hidden="true"></span><span data-voice-clock class="voice-rec-clock">0:00</span><span class="voice-rec-limit">/ 1:30</span><span class="voice-rec-hint">松开以检查</span><button data-voice-stop class="chat-icon compose-primary" type="button" aria-label="停止并检查" title="停止并检查" hidden>{4}</button></div>\n    <div class="compose-row">\n      <div class="compose-input">\n        <button data-{5}-emoji class="chat-icon" type="button" aria-label="选择表情" title="选择表情">{6}</button>\n        <textarea data-{7}-text rows="1" aria-label="消息" placeholder="消息…"></textarea>\n        <button data-chat-attachment type="button" class="chat-icon" aria-label="附加图片或文件" title="{11}">{8}</button>\n      </div>\n      <button data-voice-record class="chat-icon compose-primary" type="button" aria-label="录制语音消息" title="录制语音">{9}</button>\n      <button data-compose-send class="chat-icon compose-primary" type="submit" aria-label="发送消息" title="发送" hidden>{10}</button>\n    </div>\n    <input data-attachment-file type="file" aria-label="图片或文件" hidden>\n  </form>',
  ],
  'html.2e7c749dbe8a': [
    '<div data-compose-bar class="compose-context" hidden><p data-compose-context></p><button data-compose-cancel class="chat-icon" type="button" aria-label="Cancel reply or edit">{0}</button></div>',
    '<div data-compose-bar class="compose-context" hidden><p data-compose-context></p><button data-compose-cancel class="chat-icon" type="button" aria-label="取消回复或编辑">{0}</button></div>',
  ],
  'html.266effed7cb6': [
    '<button data-chat-collapse class="chat-icon chat-collapse" type="button" aria-label="Collapse conversation" title="Collapse conversation">{0}</button>',
    '<button data-chat-collapse class="chat-icon chat-collapse" type="button" aria-label="收起对话" title="收起对话">{0}</button>',
  ],
  'html.3b20f44af6d9': [
    '<article class="card chat-panel">\n    <div class="chat-welcome">{5}<h2>Let\'s chat?</h2><p>Choose a conversation from the menu.</p></div>\n    <div class="chat-feedback"><p data-message-status role="status"></p><details class="chat-options"><summary>Connection</summary><div class="chat-popover"><p data-message-live role="status"></p><button data-message-refresh type="button">{10}Sync now</button></div></details></div>\n    <div class="chat-layout"><section data-direct-conversation class="chat-conversation">\n      <header class="chat-header"><button data-chat-back class="chat-icon chat-mobile-back" type="button" aria-label="Back to conversations">{0}</button><button data-chat-avatar class="chat-peer-avatar" type="button" disabled aria-label="Zoom in on image">#</button><div class="chat-peer"><h3 data-message-peer></h3><p data-peer-presence></p></div><button data-call-start class="chat-icon" type="button" aria-label="Voice call" title="Voice call">{1}</button><details class="chat-options"><summary class="chat-icon" aria-label="Conversation options" title="Conversation options">{2}</summary><div class="chat-popover"><button data-chat-edit-contact type="button">{7}Edit contact</button><details><summary>{8}Representative authorizations</summary><div data-representative-chat></div></details><a href="#settings">{9}Profile and settings</a></div></details>{3}</header>\n      <div class="chat-thread">{6}<p data-message-gate class="chat-gate" role="status"></p><button data-message-older class="chat-older" type="button" hidden>Earlier messages</button><div data-message-history class="chat-history" tabindex="0" aria-label="Conversation messages" hidden></div><ul data-message-pending class="chat-pending" aria-label="Pending sends on this device"></ul></div>\n      {4}\n    </section><section data-group-conversation class="chat-conversation" hidden></section></div>\n  </article>',
    '<article class="card chat-panel">\n    <div class="chat-welcome">{5}<h2>聊聊吧？</h2><p>请从菜单中选择对话。</p></div>\n    <div class="chat-feedback"><p data-message-status role="status"></p><details class="chat-options"><summary>连接</summary><div class="chat-popover"><p data-message-live role="status"></p><button data-message-refresh type="button">{10}立即同步</button></div></details></div>\n    <div class="chat-layout"><section data-direct-conversation class="chat-conversation">\n      <header class="chat-header"><button data-chat-back class="chat-icon chat-mobile-back" type="button" aria-label="返回对话">{0}</button><button data-chat-avatar class="chat-peer-avatar" type="button" disabled aria-label="放大图片">#</button><div class="chat-peer"><h3 data-message-peer></h3><p data-peer-presence></p></div><button data-call-start class="chat-icon" type="button" aria-label="语音通话" title="语音通话">{1}</button><details class="chat-options"><summary class="chat-icon" aria-label="对话选项" title="对话选项">{2}</summary><div class="chat-popover"><button data-chat-edit-contact type="button">{7}编辑联系人</button><details><summary>{8}代表授权</summary><div data-representative-chat></div></details><a href="#settings">{9}个人资料与设置</a></div></details>{3}</header>\n      <div class="chat-thread">{6}<p data-message-gate class="chat-gate" role="status"></p><button data-message-older class="chat-older" type="button" hidden>更早的消息</button><div data-message-history class="chat-history" tabindex="0" aria-label="对话消息" hidden></div><ul data-message-pending class="chat-pending" aria-label="此设备上的待发送内容"></ul></div>\n      {4}\n    </section><section data-group-conversation class="chat-conversation" hidden></section></div>\n  </article>',
  ],
  ' Contagem indisponível.': [' Count unavailable.', ' 浏览数不可用。'],
  ' Contagem indisponível: {0}': [
    ' Count unavailable: {0}',
    ' 浏览数不可用：{0}',
  ],
  'html.73d7b945254a': [
    '<section class="chat-conversation"><header class="chat-header"><div class="chat-peer"><h3>Handle messages</h3><p>Conversations with public profiles</p></div>{0}</header><div class="chat-thread"><div data-dm-list class="dm-list"></div></div></section>',
    '<section class="chat-conversation"><header class="chat-header"><div class="chat-peer"><h3>用户名私信</h3><p>与公开个人资料的对话</p></div>{0}</header><div class="chat-thread"><div data-dm-list class="dm-list"></div></div></section>',
  ],
  'html.bac5e10aced2': [
    '<section class="chat-conversation">\n    <header class="chat-header"><a class="chat-icon chat-mobile-back" href="#communities?view=dms" aria-label="Back to handle messages">{0}</a><button data-dm-avatar class="chat-peer-avatar" type="button" aria-label="View profile photo" disabled>@</button><div class="chat-peer"><h3 data-dm-peer></h3><p data-dm-state></p></div><details class="chat-options"><summary class="chat-icon" aria-label="Conversation options" title="Conversation options">{1}</summary><div class="chat-popover" data-dm-options></div></details>{2}</header>\n    <div class="chat-thread"><p data-dm-gate class="chat-gate" role="status"></p><button data-dm-older class="chat-older" type="button" hidden>Earlier messages</button><div data-dm-history class="chat-history" tabindex="0" aria-label="Conversation messages"></div></div>\n    <div data-dm-request class="dm-request" hidden></div>\n    {3}\n  </section>',
    '<section class="chat-conversation">\n    <header class="chat-header"><a class="chat-icon chat-mobile-back" href="#communities?view=dms" aria-label="返回用户名私信">{0}</a><button data-dm-avatar class="chat-peer-avatar" type="button" aria-label="查看头像" disabled>@</button><div class="chat-peer"><h3 data-dm-peer></h3><p data-dm-state></p></div><details class="chat-options"><summary class="chat-icon" aria-label="对话选项" title="对话选项">{1}</summary><div class="chat-popover" data-dm-options></div></details>{2}</header>\n    <div class="chat-thread"><p data-dm-gate class="chat-gate" role="status"></p><button data-dm-older class="chat-older" type="button" hidden>更早的消息</button><div data-dm-history class="chat-history" tabindex="0" aria-label="对话消息"></div></div>\n    <div data-dm-request class="dm-request" hidden></div>\n    {3}\n  </section>',
  ],
  ' · Arquivada': [' · Archived', ' · 已归档'],
  ' · referência de identidade guardada': [
    ' · saved identity reference',
    ' · 已保存身份参考',
  ],
  ' · removido da agenda ativa': [
    ' · removed from active contacts',
    ' · 已从当前联系人中移除',
  ],
  'html.77e1353773c1': [
    '<article class="card"><form data-contact-settings><div data-discovery-choices></div><p>Being discoverable allows conversation requests. You still need to accept.</p><p>These choices apply to private wallet chats. Your public @ profile and posts have separate visibility.</p><button type="submit" class="primary">Apply visibility</button></form><details class="settings-help"><summary>Who can see my data?</summary><p>There is no public wallet directory or name search. Your chosen name appears in requests; photo and presence are restricted to approved contacts.</p></details><p data-contact-status role="status"></p><button data-contact-action="refresh" type="button" hidden>Try again</button></article>',
    '<article class="card"><form data-contact-settings><div data-discovery-choices></div><p>允许被找到后，他人可以申请聊天。你仍需接受。</p><p>这些选项仅适用于基于钱包的私密聊天。你的公开 @ 资料和帖子有独立的可见性设置。</p><button type="submit" class="primary">应用可见性设置</button></form><details class="settings-help"><summary>谁能查看我的数据？</summary><p>没有公开钱包目录，也无法按姓名搜索。你设置的名称会显示在请求中；图片和在线状态仅已批准联系人可见。</p></details><p data-contact-status role="status"></p><button data-contact-action="refresh" type="button" hidden>重试</button></article>',
  ],
  'html.b5f3eff2a293': [
    '<article class="card contacts-card">\n<header class="contacts-heading"><div><h1>Contacts</h1><p>Your contacts and conversation requests.</p></div><div class="contact-create-actions"><button data-private-group-action="create" type="button">Create group</button><button data-private-group-action="join" type="button">Join by link</button><button data-contact-add class="primary" type="button"><span aria-hidden="true">＋</span> Add contact</button></div></header>\n<div class="contacts-toolbar"><label class="contact-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></svg><input data-book-search type="search" maxlength="80" autocomplete="off" aria-label="Search this list" placeholder="Search this list…"></label><button data-contact-own-open class="contact-invite-link" type="button">My invitation ↗</button></div>\n<div class="contact-tabs" role="tablist" aria-label="Contact lists">\n<button data-contact-tab="main" data-tab="approved" role="tab" id="contacts-tab-approved" aria-controls="contacts-panel-approved" aria-selected="true" type="button">Contacts</button>\n<button data-contact-tab="main" data-tab="requests" role="tab" id="contacts-tab-requests" aria-controls="contacts-panel-requests" aria-selected="false" tabindex="-1" type="button">Requests <span data-contact-request-count class="contact-count" hidden></span></button>\n\n<button data-contact-tab="main" data-tab="blocked" role="tab" id="contacts-tab-blocked" aria-controls="contacts-panel-blocked" aria-selected="false" tabindex="-1" type="button">Blocked</button></div>\n<section data-contact-panel="main" data-tab="approved" id="contacts-panel-approved" role="tabpanel" aria-labelledby="contacts-tab-approved"><div class="contact-section-heading"><h2>Contacts</h2><span data-contact-page-state="approved"></span></div><ul data-contact-list="approved" class="contact-list"></ul><button data-contact-page="approved" class="contact-more" type="button" hidden>Next page</button><button data-contact-page="outgoing" class="contact-more" type="button" hidden>More pending contacts</button><button data-contact-action="book-more" class="contact-more" type="button" hidden>More saved contacts</button></section>\n<section data-contact-panel="main" data-tab="requests" id="contacts-panel-requests" role="tabpanel" aria-labelledby="contacts-tab-requests" hidden><div class="contact-subtabs" role="tablist" aria-label="Requests"><button data-contact-tab="requests" data-tab="incoming" role="tab" id="contacts-tab-incoming" aria-controls="contacts-panel-incoming" aria-selected="true" type="button">Received</button><button data-contact-tab="requests" data-tab="outgoing" role="tab" id="contacts-tab-outgoing" aria-controls="contacts-panel-outgoing" aria-selected="false" tabindex="-1" type="button">Sent</button><button data-contact-tab="requests" data-tab="rejected" role="tab" id="contacts-tab-rejected" aria-controls="contacts-panel-rejected" aria-selected="false" tabindex="-1" type="button">Declined</button></div>\n<section data-contact-panel="requests" data-tab="incoming" id="contacts-panel-incoming" role="tabpanel" aria-labelledby="contacts-tab-incoming"><p class="contact-hint">You decide who can chat with you.</p><ul data-contact-list="incoming" class="contact-list"></ul><button data-contact-page="incoming" class="contact-more" type="button" hidden>Next page</button></section>\n<section data-contact-panel="requests" data-tab="outgoing" id="contacts-panel-outgoing" role="tabpanel" aria-labelledby="contacts-tab-outgoing" hidden><p class="contact-hint">Waiting for the recipient to accept.</p><ul data-contact-list="outgoing" class="contact-list"></ul><button data-contact-page="outgoing" class="contact-more" type="button" hidden>Next page</button></section>\n<section data-contact-panel="requests" data-tab="rejected" id="contacts-panel-rejected" role="tabpanel" aria-labelledby="contacts-tab-rejected" hidden><ul data-contact-list="rejected" class="contact-list"></ul><button data-contact-page="rejected" class="contact-more" type="button" hidden>Next page</button></section></section>\n\n<section data-contact-panel="main" data-tab="blocked" id="contacts-panel-blocked" role="tabpanel" aria-labelledby="contacts-tab-blocked" hidden><div class="contact-section-heading"><h2>Blocks</h2></div><p class="contact-hint">Unblocking requires a new acceptance before chatting. The block applies to this identity.</p><ul data-contact-list="blocked" class="contact-list"></ul><button data-contact-page="blocked" class="contact-more" type="button" hidden>Next page</button></section>\n<div class="contact-feedback"><p data-contact-status role="status"></p><button data-contact-action="refresh" type="button" hidden>Try again</button></div><p class="contact-test-note">Search in items loaded on this device.</p>\n<dialog data-contact-editor class="contact-dialog" aria-labelledby="contact-editor-title"><header><div><span class="contact-eyebrow">YOUR CONTACTS</span><h2 id="contact-editor-title" data-book-title>Add contact</h2></div><button data-contact-editor-close class="contact-close" type="button" aria-label="Close form">{0}</button></header>\n<div class="contact-subtabs" role="tablist" aria-label="How to add a contact"><button data-contact-tab="editor" data-tab="wallet" role="tab" id="contact-tab-wallet" aria-controls="contact-panel-wallet" aria-selected="true" type="button">By wallet</button><button data-contact-tab="editor" data-tab="invite" role="tab" id="contact-tab-invite" aria-controls="contact-panel-invite" aria-selected="false" tabindex="-1" type="button">By invitation</button></div>\n<section data-contact-panel="editor" data-tab="wallet" id="contact-panel-wallet" role="tabpanel" aria-labelledby="contact-tab-wallet"><form data-book-form><label>Full wallet address<input data-book-address required maxlength="128" autocomplete="off" spellcheck="false" placeholder="0x… or a Solana address"></label><label><span>Private nickname <small class="contact-optional">opcional</small></span><input data-book-alias maxlength="80" autocomplete="off" placeholder="How you want to save this contact"></label><p class="contact-hint">Saving to contacts does not send a request.</p><div class="contact-form-actions"><button type="submit" class="primary">Save contact</button><button data-contact-action="discover" type="button">Request conversation</button></div></form><p data-contact-discovery class="contact-hint"></p><div data-contact-discovery-actions></div></section>\n<section data-contact-panel="editor" data-tab="invite" id="contact-panel-invite" role="tabpanel" aria-labelledby="contact-tab-invite" hidden>{1}<div data-contact-invite-peer></div></section>\n<div class="contact-feedback"><p data-contact-editor-status role="status"></p></div></dialog>{2}</article>',
    '<article class="card contacts-card">\n<header class="contacts-heading"><div><h1>联系人</h1><p>你的联系人与聊天请求。</p></div><div class="contact-create-actions"><button data-private-group-action="create" type="button">创建群组</button><button data-private-group-action="join" type="button">通过链接加入</button><button data-contact-add class="primary" type="button"><span aria-hidden="true">＋</span> 添加联系人</button></div></header>\n<div class="contacts-toolbar"><label class="contact-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></svg><input data-book-search type="search" maxlength="80" autocomplete="off" aria-label="搜索此列表" placeholder="搜索此列表…"></label><button data-contact-own-open class="contact-invite-link" type="button">我的邀请 ↗</button></div>\n<div class="contact-tabs" role="tablist" aria-label="联系人列表">\n<button data-contact-tab="main" data-tab="approved" role="tab" id="contacts-tab-approved" aria-controls="contacts-panel-approved" aria-selected="true" type="button">联系人</button>\n<button data-contact-tab="main" data-tab="requests" role="tab" id="contacts-tab-requests" aria-controls="contacts-panel-requests" aria-selected="false" tabindex="-1" type="button">请求 <span data-contact-request-count class="contact-count" hidden></span></button>\n\n<button data-contact-tab="main" data-tab="blocked" role="tab" id="contacts-tab-blocked" aria-controls="contacts-panel-blocked" aria-selected="false" tabindex="-1" type="button">已屏蔽</button></div>\n<section data-contact-panel="main" data-tab="approved" id="contacts-panel-approved" role="tabpanel" aria-labelledby="contacts-tab-approved"><div class="contact-section-heading"><h2>联系人</h2><span data-contact-page-state="approved"></span></div><ul data-contact-list="approved" class="contact-list"></ul><button data-contact-page="approved" class="contact-more" type="button" hidden>下一页</button><button data-contact-page="outgoing" class="contact-more" type="button" hidden>更多待接受的联系人</button><button data-contact-action="book-more" class="contact-more" type="button" hidden>更多已保存的联系人</button></section>\n<section data-contact-panel="main" data-tab="requests" id="contacts-panel-requests" role="tabpanel" aria-labelledby="contacts-tab-requests" hidden><div class="contact-subtabs" role="tablist" aria-label="请求"><button data-contact-tab="requests" data-tab="incoming" role="tab" id="contacts-tab-incoming" aria-controls="contacts-panel-incoming" aria-selected="true" type="button">已收到</button><button data-contact-tab="requests" data-tab="outgoing" role="tab" id="contacts-tab-outgoing" aria-controls="contacts-panel-outgoing" aria-selected="false" tabindex="-1" type="button">已发送</button><button data-contact-tab="requests" data-tab="rejected" role="tab" id="contacts-tab-rejected" aria-controls="contacts-panel-rejected" aria-selected="false" tabindex="-1" type="button">已拒绝</button></div>\n<section data-contact-panel="requests" data-tab="incoming" id="contacts-panel-incoming" role="tabpanel" aria-labelledby="contacts-tab-incoming"><p class="contact-hint">由你决定谁可以与你聊天。</p><ul data-contact-list="incoming" class="contact-list"></ul><button data-contact-page="incoming" class="contact-more" type="button" hidden>下一页</button></section>\n<section data-contact-panel="requests" data-tab="outgoing" id="contacts-panel-outgoing" role="tabpanel" aria-labelledby="contacts-tab-outgoing" hidden><p class="contact-hint">等待接收者接受。</p><ul data-contact-list="outgoing" class="contact-list"></ul><button data-contact-page="outgoing" class="contact-more" type="button" hidden>下一页</button></section>\n<section data-contact-panel="requests" data-tab="rejected" id="contacts-panel-rejected" role="tabpanel" aria-labelledby="contacts-tab-rejected" hidden><ul data-contact-list="rejected" class="contact-list"></ul><button data-contact-page="rejected" class="contact-more" type="button" hidden>下一页</button></section></section>\n\n<section data-contact-panel="main" data-tab="blocked" id="contacts-panel-blocked" role="tabpanel" aria-labelledby="contacts-tab-blocked" hidden><div class="contact-section-heading"><h2>屏蔽列表</h2></div><p class="contact-hint">解除屏蔽后，需要重新接受才能聊天。屏蔽针对该身份。</p><ul data-contact-list="blocked" class="contact-list"></ul><button data-contact-page="blocked" class="contact-more" type="button" hidden>下一页</button></section>\n<div class="contact-feedback"><p data-contact-status role="status"></p><button data-contact-action="refresh" type="button" hidden>重试</button></div><p class="contact-test-note">搜索此设备上已加载的项目。</p>\n<dialog data-contact-editor class="contact-dialog" aria-labelledby="contact-editor-title"><header><div><span class="contact-eyebrow">你的联系人</span><h2 id="contact-editor-title" data-book-title>添加联系人</h2></div><button data-contact-editor-close class="contact-close" type="button" aria-label="关闭表单">{0}</button></header>\n<div class="contact-subtabs" role="tablist" aria-label="如何添加联系人"><button data-contact-tab="editor" data-tab="wallet" role="tab" id="contact-tab-wallet" aria-controls="contact-panel-wallet" aria-selected="true" type="button">通过钱包</button><button data-contact-tab="editor" data-tab="invite" role="tab" id="contact-tab-invite" aria-controls="contact-panel-invite" aria-selected="false" tabindex="-1" type="button">通过邀请</button></div>\n<section data-contact-panel="editor" data-tab="wallet" id="contact-panel-wallet" role="tabpanel" aria-labelledby="contact-tab-wallet"><form data-book-form><label>完整钱包地址<input data-book-address required maxlength="128" autocomplete="off" spellcheck="false" placeholder="0x… 或 Solana 地址"></label><label><span>私密备注名 <small class="contact-optional">opcional</small></span><input data-book-alias maxlength="80" autocomplete="off" placeholder="此联系人的保存名称"></label><p class="contact-hint">保存到联系人不会发送请求。</p><div class="contact-form-actions"><button type="submit" class="primary">保存联系人</button><button data-contact-action="discover" type="button">申请聊天</button></div></form><p data-contact-discovery class="contact-hint"></p><div data-contact-discovery-actions></div></section>\n<section data-contact-panel="editor" data-tab="invite" id="contact-panel-invite" role="tabpanel" aria-labelledby="contact-tab-invite" hidden>{1}<div data-contact-invite-peer></div></section>\n<div class="contact-feedback"><p data-contact-editor-status role="status"></p></div></dialog>{2}</article>',
  ],
  'html.597746d2b14a': [
    '<dialog data-contact-invites class="contact-dialog" aria-labelledby="contact-invites-title"><header><div><span class="contact-eyebrow">SHARE CONTACT</span><h2 id="contact-invites-title">My invitation</h2></div><button data-contact-invites-close class="contact-close" type="button" aria-label="Close my invitation">{0}</button></header><p class="contact-hint">Share this link or QR with people who may request a conversation. You choose whom to accept; the invitation does not authorize devices.</p><div data-contact-own-invite hidden><label>My invitation link<input data-contact-invite readonly spellcheck="false"></label><div data-contact-invite-qr class="device-qr"></div><div class="contact-form-actions"><button data-contact-action="copy" type="button" class="primary">Copy link</button><button data-contact-action="revoke" type="button">Revoke invitation</button></div></div><button data-contact-action="rotate" type="button">Create invitation</button><p class="contact-hint">Replacing or revoking invalidates the previous link for new requests.</p><div class="contact-feedback"><p data-contact-invite-status role="status"></p></div></dialog>',
    '<dialog data-contact-invites class="contact-dialog" aria-labelledby="contact-invites-title"><header><div><span class="contact-eyebrow">分享联系人</span><h2 id="contact-invites-title">我的邀请</h2></div><button data-contact-invites-close class="contact-close" type="button" aria-label="关闭我的邀请">{0}</button></header><p class="contact-hint">将此链接或二维码分享给可以申请与你聊天的人。由你决定是否接受；邀请不会授权设备。</p><div data-contact-own-invite hidden><label>我的邀请链接<input data-contact-invite readonly spellcheck="false"></label><div data-contact-invite-qr class="device-qr"></div><div class="contact-form-actions"><button data-contact-action="copy" type="button" class="primary">复制链接</button><button data-contact-action="revoke" type="button">撤销邀请</button></div></div><button data-contact-action="rotate" type="button">创建邀请</button><p class="contact-hint">更换或撤销后，旧链接无法发起新请求。</p><div class="contact-feedback"><p data-contact-invite-status role="status"></p></div></dialog>',
  ],
  'html.801287f32cb5': [
    '<form data-contact-invite-form><label>Invitation link<input data-contact-received type="url" maxlength="512" required autocomplete="off" spellcheck="false" placeholder="Paste a 0xDMme link"></label><p class="contact-hint">The invitation allows a conversation request. The recipient must accept.</p><div class="contact-form-actions"><button type="submit" class="primary">Request conversation</button><button data-contact-action="scan" type="button">Scan QR</button><button data-contact-action="stop-camera" type="button" hidden>Stop camera</button></div><video data-contact-camera hidden muted playsinline></video></form>',
    '<form data-contact-invite-form><label>邀请链接<input data-contact-received type="url" maxlength="512" required autocomplete="off" spellcheck="false" placeholder="粘贴 0xDMme 链接"></label><p class="contact-hint">邀请允许发起聊天请求。接收者仍需接受。</p><div class="contact-form-actions"><button type="submit" class="primary">申请聊天</button><button data-contact-action="scan" type="button">扫描二维码</button><button data-contact-action="stop-camera" type="button" hidden>关闭摄像头</button></div><video data-contact-camera hidden muted playsinline></video></form>',
  ],
  'html.5acc35953618': [
    '<summary>Sign in from another device</summary><p>On a connected device, open Profile → Connected devices and generate a code.</p><label>Linking code or link<textarea data-enrollment-code spellcheck="false" autocomplete="off" autocapitalize="none" placeholder="Paste code or link"></textarea></label><button type="button">Continue</button><p role="status"></p>',
    '<summary>从另一台设备登录</summary><p>在已连接设备上，打开“个人资料 → 已连接设备”并生成代码。</p><label>关联码或链接<textarea data-enrollment-code spellcheck="false" autocomplete="off" autocapitalize="none" placeholder="粘贴代码或链接"></textarea></label><button type="button">继续</button><p role="status"></p>',
  ],
  'html.73a1fbbc7e77': [
    '<h2>Sign in on this device?</h2><p>Connect this browser to the account on the device that generated the QR code.</p><p data-enrollment-status role="status">Keep the source device open until the connection finishes.</p><button type="button" data-enrollment-confirm class="primary">Confirm sign-in</button><button type="button" data-enrollment-close>Cancel</button>',
    '<h2>在此设备上登录？</h2><p>将此浏览器连接到生成二维码的设备所使用的账户。</p><p data-enrollment-status role="status">连接完成前，请保持源设备打开。</p><button type="button" data-enrollment-confirm class="primary">确认登录</button><button type="button" data-enrollment-close>取消</button>',
  ],
  'html.63049f816b60': [
    '<article class="card"><h2>Devices</h2><p data-device-status role="status"></p><button data-device-wallet type="button" hidden>Confirm wallet for sensitive actions</button><button data-device-retry type="button" hidden>Try again</button><div data-wallet-pending hidden><button data-wallet-open type="button">Open wallet</button><button data-wallet-cancel type="button">Cancel</button></div><div data-devices-connected hidden><ul data-device-list></ul><button data-device-create type="button">Link another device</button><div data-enrollment-code hidden><div data-link-qr class="device-qr"></div><textarea data-device-code readonly aria-label="Device linking code"></textarea><button data-device-copy type="button">Copy code</button><p>Keep this app open while linking. The code is valid for five minutes.</p></div></div><form data-device-join><label>Device linking code<textarea data-device-received required spellcheck="false"></textarea></label><button type="submit">Link this device</button><button data-device-scan type="button">Scan QR code</button></form><div data-camera hidden><video muted playsinline aria-label="Scan linking code"></video><button data-stop-camera type="button">Close camera</button></div></article>',
    '<article class="card"><h2>设备</h2><p data-device-status role="status"></p><button data-device-wallet type="button" hidden>确认钱包以执行敏感操作</button><button data-device-retry type="button" hidden>重试</button><div data-wallet-pending hidden><button data-wallet-open type="button">打开钱包</button><button data-wallet-cancel type="button">取消</button></div><div data-devices-connected hidden><ul data-device-list></ul><button data-device-create type="button">关联另一台设备</button><div data-enrollment-code hidden><div data-link-qr class="device-qr"></div><textarea data-device-code readonly aria-label="设备关联码"></textarea><button data-device-copy type="button">复制代码</button><p>关联期间请保持应用打开。代码五分钟内有效。</p></div></div><form data-device-join><label>设备关联码<textarea data-device-received required spellcheck="false"></textarea></label><button type="submit">关联此设备</button><button data-device-scan type="button">扫描二维码</button></form><div data-camera hidden><video muted playsinline aria-label="扫描关联码"></video><button data-stop-camera type="button">关闭摄像头</button></div></article>',
  ],
  ' · este aparelho': [' · this device', ' · 此设备'],
  'html.81724dfa0bc5': [
    '<nav class="picker-modes" data-modes hidden aria-label="Emoji or GIF"><button type="button" data-mode="emoji" aria-pressed="true">Emoji</button><button type="button" data-mode="gif" aria-pressed="false">GIF</button></nav><div class="gif-pane" data-gif-pane hidden></div><div class="emoji-top"><label class="emoji-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><span class="visually-hidden">Search emoji</span><input type="search" maxlength="128" autocomplete="off" data-query placeholder="Search emoji"></label><label class="emoji-tone"><span class="visually-hidden">Skin tone</span><select data-tone></select></label><button type="button" class="emoji-close" data-close aria-label="Close emoji panel">×</button></div><section class="emoji-recent" data-recent-section hidden><h3>Recent</h3><div class="emoji-recent-row" data-recent></div></section><h3 class="emoji-section-title" data-section-title></h3><div data-grid class="emoji-grid" role="listbox" aria-label="Emoji"></div><p data-result class="emoji-empty" role="status"></p><button type="button" class="emoji-custom" data-custom hidden>Use typed emoji</button><nav class="emoji-dock" data-dock aria-label="Emoji categories"></nav><small class="emoji-credit" data-art role="status">Loading artwork…</small>',
    '<nav class="picker-modes" data-modes hidden aria-label="表情或 GIF"><button type="button" data-mode="emoji" aria-pressed="true">表情</button><button type="button" data-mode="gif" aria-pressed="false">GIF</button></nav><div class="gif-pane" data-gif-pane hidden></div><div class="emoji-top"><label class="emoji-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><span class="visually-hidden">搜索表情</span><input type="search" maxlength="128" autocomplete="off" data-query placeholder="搜索表情"></label><label class="emoji-tone"><span class="visually-hidden">肤色</span><select data-tone></select></label><button type="button" class="emoji-close" data-close aria-label="关闭表情面板">×</button></div><section class="emoji-recent" data-recent-section hidden><h3>最近</h3><div class="emoji-recent-row" data-recent></div></section><h3 class="emoji-section-title" data-section-title></h3><div data-grid class="emoji-grid" role="listbox" aria-label="表情"></div><p data-result class="emoji-empty" role="status"></p><button type="button" class="emoji-custom" data-custom hidden>使用输入的表情</button><nav class="emoji-dock" data-dock aria-label="表情类别"></nav><small class="emoji-credit" data-art role="status">正在加载表情图案…</small>',
  ],
  'html.201618052901': [
    '<label class="emoji-search gif-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><span class="visually-hidden">Search GIF</span><input type="search" maxlength="100" autocomplete="off" data-gif-query placeholder="Search KLIPY"></label><div class="gif-grid" data-gif-grid></div><p class="emoji-empty" data-gif-status role="status"></p><small class="emoji-credit">Powered by KLIPY · searches and GIFs go through KLIPY</small>',
    '<label class="emoji-search gif-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><span class="visually-hidden">搜索 GIF</span><input type="search" maxlength="100" autocomplete="off" data-gif-query placeholder="搜索 KLIPY"></label><div class="gif-grid" data-gif-grid></div><p class="emoji-empty" data-gif-status role="status"></p><small class="emoji-credit">由 KLIPY 提供 · 搜索和 GIF 通过 KLIPY</small>',
  ],
  'html.ea146116f72c': [
    '<p class="group-hint">Add your contacts to the group. They can leave at any time.</p><label class="group-search">Search this list<input data-contact-search type="search" placeholder="Name or wallet" autocomplete="off"></label><ul data-contacts class="group-people-list"></ul><button data-more-contacts type="button" hidden>More contacts</button><section class="group-invitation-section"><h3>Invite by link</h3><p class="group-hint">Anyone with the link can join. Generating one on another device may replace the current invitation.</p><div class="group-button-row"><button data-link class="group-primary" type="button">Generate / copy link</button><button data-revoke class="group-secondary" type="button">Revoke link</button></div><label data-invitation-label hidden>Shareable invitation<input data-invitation readonly></label></section>',
    '<p class="group-hint">将联系人添加到群组。他们可以随时退出。</p><label class="group-search">搜索此列表<input data-contact-search type="search" placeholder="名称或钱包地址" autocomplete="off"></label><ul data-contacts class="group-people-list"></ul><button data-more-contacts type="button" hidden>更多联系人</button><section class="group-invitation-section"><h3>通过链接邀请</h3><p class="group-hint">任何持有链接的人都可以加入。在其他设备上生成链接可能替换当前邀请。</p><div class="group-button-row"><button data-link class="group-primary" type="button">生成/复制链接</button><button data-revoke class="group-secondary" type="button">撤销链接</button></div><label data-invitation-label hidden>可分享邀请<input data-invitation readonly></label></section>',
  ],
  'html.9012ccf1c0d4': [
    '<form><label>Invitation link<input name="invitation" type="url" required autocomplete="off" spellcheck="false"></label><p>When you join, participants will see your private profile. You will receive messages from the time you join.</p><div class="group-form-footer"><button class="group-primary" type="submit">Join group</button></div></form>',
    '<form><label>邀请链接<input name="invitation" type="url" required autocomplete="off" spellcheck="false"></label><p>加入后，成员将看到你的私密个人资料。你只能接收加入后的消息。</p><div class="group-form-footer"><button class="group-primary" type="submit">加入群组</button></div></form>',
  ],
  'html.c392c59440f2': [
    '<div class="group-create-preview"><span data-create-avatar class="group-create-avatar" aria-hidden="true">#</span><p>A place to talk<br>with your people.</p></div><form><label>Group name<input name="title" maxlength="160" required autocomplete="off" placeholder="What will the group be called?"></label><p class="group-hint">After creating, add contacts or share an invitation.</p><div class="group-form-footer"><button class="group-primary" type="submit">Create group</button></div></form>',
    '<div class="group-create-preview"><span data-create-avatar class="group-create-avatar" aria-hidden="true">#</span><p>一个聊天的空间<br>与你关心的人。</p></div><form><label>群组名称<input name="title" maxlength="160" required autocomplete="off" placeholder="群组叫什么名字？"></label><p class="group-hint">创建后，添加联系人或分享邀请。</p><div class="group-form-footer"><button class="group-primary" type="submit">创建群组</button></div></form>',
  ],
  'html.8f97d3de1ea5': [
    '<header><div><span class="group-eyebrow">PRIVATE GROUP</span><h2 id="group-dialog-title"></h2></div><button data-close class="group-close" type="button" aria-label="Close">{0}</button></header>{1}<p data-feedback class="group-feedback" role="status"></p>',
    '<header><div><span class="group-eyebrow">私密群组</span><h2 id="group-dialog-title"></h2></div><button data-close class="group-close" type="button" aria-label="关闭">{0}</button></header>{1}<p data-feedback class="group-feedback" role="status"></p>',
  ],
  'html.e652af8025ee': [
    '<header class="chat-header"><button data-chat-back class="chat-icon chat-mobile-back" type="button" aria-label="Back to conversations">{0}</button><button data-group-avatar data-group-photo class="chat-peer-avatar group-photo-trigger" type="button" aria-label="Change group photo">#</button><div class="chat-peer"><h3 data-group-title></h3><p data-group-count></p></div><button data-group-settings-open class="chat-icon" type="button" aria-label="Group settings" title="Group settings">{1}</button>{2}</header><p data-group-notice class="compose-notice" role="status"></p><div class="chat-thread"><button data-group-older class="chat-older" type="button" hidden>Earlier messages</button><div data-group-history class="chat-history" tabindex="0" aria-label="Group messages"></div><ul data-group-pending class="chat-pending" aria-label="Pending group sends"></ul></div>{3}',
    '<header class="chat-header"><button data-chat-back class="chat-icon chat-mobile-back" type="button" aria-label="返回对话">{0}</button><button data-group-avatar data-group-photo class="chat-peer-avatar group-photo-trigger" type="button" aria-label="更换群组图片">#</button><div class="chat-peer"><h3 data-group-title></h3><p data-group-count></p></div><button data-group-settings-open class="chat-icon" type="button" aria-label="群组设置" title="群组设置">{1}</button>{2}</header><p data-group-notice class="compose-notice" role="status"></p><div class="chat-thread"><button data-group-older class="chat-older" type="button" hidden>更早的消息</button><div data-group-history class="chat-history" tabindex="0" aria-label="群组消息"></div><ul data-group-pending class="chat-pending" aria-label="群组待发送内容"></ul></div>{3}',
  ],
  'html.8694eeb2078e': [
    '<button data-group-new type="button">New group</button><p data-group-mode></p><button data-group-cancel-create type="button" hidden>Discard local creation request</button><details><summary>Group invitations and transfers</summary><div data-group-incoming></div><button data-group-more-incoming type="button" hidden>More invitations</button></details>',
    '<button data-group-new type="button">新群组</button><p data-group-mode></p><button data-group-cancel-create type="button" hidden>丢弃本地创建请求</button><details><summary>群组邀请与转让</summary><div data-group-incoming></div><button data-group-more-incoming type="button" hidden>更多邀请</button></details>',
  ],
  'Rascunho {0} pendente ': ['Draft {0} pending ', '草稿 {0} 待处理 '],
  ' · ⚠ limpeza de mídias em {0}': [
    ' · ⚠ media cleanup in {0}',
    ' · ⚠ 媒体将在 {0} 后清理',
  ],
  ' · {0} não lidas': [' · {0} unread', ' · {0} 条未读'],
  ' · silenciado': [' · muted', ' · 已静音'],
  'html.b63f4d3d54aa': [
    '<header><div><span class="group-eyebrow">PRIVATE GROUP</span><h2>Group photo</h2></div><button data-close class="group-close" type="button" aria-label="Close group photo">{0}</button></header><div data-preview class="group-photo-preview" aria-hidden="true"></div><p class="group-hint">Choose a group photo. It will be cropped to a square.</p><input data-file type="file" accept="image/png,image/jpeg,image/webp" hidden><div class="group-button-row"><button data-pick type="button">Choose photo</button><button data-remove class="group-danger" type="button">Remove photo</button></div><div class="group-form-footer"><button data-save class="group-primary" type="button" disabled>Save photo</button></div><p data-feedback class="group-feedback" role="status"></p>',
    '<header><div><span class="group-eyebrow">私密群组</span><h2>群组图片</h2></div><button data-close class="group-close" type="button" aria-label="关闭群组图片">{0}</button></header><div data-preview class="group-photo-preview" aria-hidden="true"></div><p class="group-hint">请选择群组图片。图片将裁剪为正方形。</p><input data-file type="file" accept="image/png,image/jpeg,image/webp" hidden><div class="group-button-row"><button data-pick type="button">选择图片</button><button data-remove class="group-danger" type="button">移除图片</button></div><div class="group-form-footer"><button data-save class="group-primary" type="button" disabled>保存图片</button></div><p data-feedback class="group-feedback" role="status"></p>',
  ],
  'html.6f2aac1c9ed0': [
    '<dialog data-group-settings class="group-dialog group-settings" aria-label="Group settings"><header><div><span class="group-eyebrow">PRIVATE GROUP</span><h2>Group settings</h2></div><button data-group-settings-close class="group-close" type="button" aria-label="Close settings">{0}</button></header><div class="group-settings-identity"><button data-group-settings-avatar data-group-photo class="group-person-avatar group-photo-trigger" type="button" aria-label="Change group photo" title="Change group photo"></button><div><strong data-group-settings-title></strong><p data-group-settings-count></p></div></div><section class="group-members-section"><div class="group-section-heading"><h3>Participants</h3><button data-group-manage class="group-primary" type="button">Add</button></div><ul data-group-members class="group-people-list"></ul></section><details data-group-vault class="group-vault"><summary>Group vault<span aria-hidden="true">⌄</span></summary><div class="group-vault-body"><p data-group-usage></p><p data-group-cleanup-warning role="status"></p><ul data-group-cleanup-items></ul><button data-group-cleanup-more type="button" hidden>Next selected media</button><p><a href="#vault">Save an encrypted backup</a> to keep a copy of media before cleanup. Statuses are not included in the backup.</p><button data-group-clear class="group-danger" type="button">Clear remote vault</button></div></details><footer class="group-settings-footer"><p data-group-owner-note class="group-hint">To leave, offer ownership to another member and wait for acceptance.</p><div class="group-button-row"><button data-group-leave class="group-danger" type="button">Leave group</button><button data-group-delete class="group-danger" type="button">Delete group</button></div></footer><p data-group-settings-notice role="status" class="group-feedback"></p></dialog>',
    '<dialog data-group-settings class="group-dialog group-settings" aria-label="群组设置"><header><div><span class="group-eyebrow">私密群组</span><h2>群组设置</h2></div><button data-group-settings-close class="group-close" type="button" aria-label="关闭设置">{0}</button></header><div class="group-settings-identity"><button data-group-settings-avatar data-group-photo class="group-person-avatar group-photo-trigger" type="button" aria-label="更换群组图片" title="更换群组图片"></button><div><strong data-group-settings-title></strong><p data-group-settings-count></p></div></div><section class="group-members-section"><div class="group-section-heading"><h3>成员</h3><button data-group-manage class="group-primary" type="button">添加</button></div><ul data-group-members class="group-people-list"></ul></section><details data-group-vault class="group-vault"><summary>群组保险库<span aria-hidden="true">⌄</span></summary><div class="group-vault-body"><p data-group-usage></p><p data-group-cleanup-warning role="status"></p><ul data-group-cleanup-items></ul><button data-group-cleanup-more type="button" hidden>下一批已选媒体</button><p><a href="#vault">保存加密备份</a> 以在清理前保留媒体副本。状态不包含在备份中。</p><button data-group-clear class="group-danger" type="button">清理远程保险库</button></div></details><footer class="group-settings-footer"><p data-group-owner-note class="group-hint">退出前，请向其他成员转让所有权并等待对方接受。</p><div class="group-button-row"><button data-group-leave class="group-danger" type="button">退出群组</button><button data-group-delete class="group-danger" type="button">删除群组</button></div></footer><p data-group-settings-notice role="status" class="group-feedback"></p></dialog>',
  ],
  ' · silenciada': [' · muted', ' · 已静音'],
  ' · organização em conflito': [
    ' · conflicting organization',
    ' · 组织存在冲突',
  ],
  'Editada · ': ['Edited · ', '已编辑 · '],
  'html.bc850aca5a52': [
    '<div class="search-heading"><h2 id="conversation-search-title">Search</h2><button type="button" data-search-close aria-label="Close search">×</button></div><form><label for="conversation-query">Chats, contacts or words in messages</label><div class="search-input-row"><input id="conversation-query" type="search" maxlength="128" autocomplete="off" spellcheck="false"><button type="submit">Search messages</button></div></form><p class="search-scope">Local search in loaded chats and messages synced or imported on this device.</p><h3>Chats and contacts</h3><div data-search-chats class="chat-contacts"></div><h3>Messages</h3><p data-search-notice role="status">Type to find a conversation or search for words in messages.</p><ul data-search-messages></ul><button type="button" data-search-next hidden>Continue search</button>',
    '<div class="search-heading"><h2 id="conversation-search-title">搜索</h2><button type="button" data-search-close aria-label="关闭搜索">×</button></div><form><label for="conversation-query">聊天、联系人或消息中的文字</label><div class="search-input-row"><input id="conversation-query" type="search" maxlength="128" autocomplete="off" spellcheck="false"><button type="submit">搜索消息</button></div></form><p class="search-scope">在此设备已加载的聊天以及已同步或导入的消息中进行本地搜索。</p><h3>聊天与联系人</h3><div data-search-chats class="chat-contacts"></div><h3>消息</h3><p data-search-notice role="status">输入以查找对话，或搜索消息中的文字。</p><ul data-search-messages></ul><button type="button" data-search-next hidden>继续搜索</button>',
  ],
  'html.71689221bc60': [
    '<article class="card notifications-card"><h2>Push on this device</h2><p>The provider receives subscription details and timing, without text, wallet or contact name.</p><div class="settings-actions"><button data-push-enable type="button">Enable push on this device</button><button data-push-disable type="button">Disable push on this device</button></div><p class="settings-hint">iPhone/iPad: open from the home screen icon before enabling. Your browser will ask for permission.</p><div data-push-settings></div>\n<section class="settings-block"><h3>Sounds</h3><div class="settings-actions"><button data-sound-toggle type="button" aria-pressed="true">Disable sounds</button><p data-sound-status role="status"></p></div></section>\n<details class="settings-help"><summary>How do alerts and sounds work?</summary><p>Messages and community replies use generic alerts. Calls may show “Incoming voice call”, depending on the preference above. Push permission and lock screen display are controlled by the browser and system.</p><p>Sounds are on initially and the choice stays in this browser, including when switching accounts. The browser may require a tap to allow audio. Push volume and sound follow your system. Muted or archived conversations do not alert; offline or without a valid session, no new remote alert is shown.</p></details><p data-daily-status role="status"></p></article>',
    '<article class="card notifications-card"><h2>此设备的推送</h2><p>服务商会接收订阅信息和时间，不会接收文字、钱包信息或联系人姓名。</p><div class="settings-actions"><button data-push-enable type="button">在此设备上启用推送</button><button data-push-disable type="button">关闭此设备的推送</button></div><p class="settings-hint">iPhone/iPad：请先通过主屏幕图标打开，再启用。浏览器会请求权限。</p><div data-push-settings></div>\n<section class="settings-block"><h3>声音</h3><div class="settings-actions"><button data-sound-toggle type="button" aria-pressed="true">关闭声音</button><p data-sound-status role="status"></p></div></section>\n<details class="settings-help"><summary>通知和声音如何运作？</summary><p>消息和社区回复使用通用通知。根据上方设置，通话可能显示“收到语音来电”。推送权限和锁屏显示由浏览器及系统控制。</p><p>声音默认开启，选项保留在此浏览器中，包括切换账户后。浏览器可能需要点击才能播放音频。推送音量和声音由系统控制。静音或归档对话不会通知；离线或没有有效会话时，不会出现新的远程通知。</p></details><p data-daily-status role="status"></p></article>',
  ],
  'html.d3072845e018': [
    '<article class="card public-profile-card"><h2>Public profile</h2>\n<div data-public-create><p>Your handle, public activity and all followed communities are visible on the web. Your private wallet, name and photo are not included in this profile.</p><label>Public handle<input data-public-input type="text" minlength="3" maxlength="31" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="seu_nome"></label>\n<p>3–30 unaccented letters, numbers or _. Your handle is unique and fixed for the lifetime of your account.</p>\n<button type="button" class="primary" data-public-action="create">Create public profile</button></div>\n<div data-public-owned hidden></div>\n<section data-public-moderation aria-label="Rejected public files"></section>\n<div><button type="button" data-public-action="moderation-latest" hidden>Latest notices</button><button type="button" data-public-action="moderation-older" hidden>Previous notices</button></div>\n<p data-external-media-status role="status"></p><button type="button" data-public-action="external-media">External media</button>\n<p data-public-status role="status"></p><button type="button" data-public-action="reload" hidden>Try again</button></article>',
    '<article class="card public-profile-card"><h2>公开个人资料</h2>\n<div data-public-create><p>你的用户名、公开动态以及所有已关注社区在网页上可见。此个人资料不包含私密钱包信息、姓名和图片。</p><label>公开用户名<input data-public-input type="text" minlength="3" maxlength="31" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="seu_nome"></label>\n<p>3–30 个不带重音符号的字母、数字或下划线。用户名唯一，在账户存续期间不可更改。</p>\n<button type="button" class="primary" data-public-action="create">创建公开个人资料</button></div>\n<div data-public-owned hidden></div>\n<section data-public-moderation aria-label="被拒绝的公开文件"></section>\n<div><button type="button" data-public-action="moderation-latest" hidden>最新通知</button><button type="button" data-public-action="moderation-older" hidden>先前通知</button></div>\n<p data-external-media-status role="status"></p><button type="button" data-public-action="external-media">外部媒体</button>\n<p data-public-status role="status"></p><button type="button" data-public-action="reload" hidden>重试</button></article>',
  ],
  ' e mais {0} {1}': [' and {0} more {1}', ' 以及另外 {0} 个{1}'],
  'Seguido por ': ['Followed by ', '关注者 '],
  'html.b1c18c8a59fa': [
    '<div class="profile-editor">\n<div class="profile-editor-banner"><button type="button" class="profile-editor-pick" data-pick="banner" aria-label="Change banner"><img alt="" hidden><span class="profile-editor-hint">Change banner</span></button><button type="button" class="profile-editor-remove" data-remove="banner" aria-label="Remove banner" title="Remove banner" hidden>{0}</button></div>\n<div class="profile-editor-identity"><div class="profile-editor-avatar"><button type="button" class="profile-editor-pick" data-pick="avatar" aria-label="Change photo"><span data-avatar-slot>@</span></button><button type="button" class="profile-editor-remove" data-remove="avatar" aria-label="Remove photo" title="Remove photo" hidden>{1}</button></div>\n<div class="profile-editor-title"><h3 data-public-own-handle></h3><a data-public-page>View my public profile</a></div></div>\n<label class="profile-editor-description"><span>Description</span><textarea data-public-description rows="3" placeholder="Tell people about yourself. Use @ to mention users and communities."></textarea><small data-description-count></small></label>\n<button type="button" class="primary" data-confirm-profile>Confirm changes</button><input type="file" data-pick-file accept="image/png,image/jpeg,image/webp" hidden></div>',
    '<div class="profile-editor">\n<div class="profile-editor-banner"><button type="button" class="profile-editor-pick" data-pick="banner" aria-label="更换横幅"><img alt="" hidden><span class="profile-editor-hint">更换横幅</span></button><button type="button" class="profile-editor-remove" data-remove="banner" aria-label="移除横幅" title="移除横幅" hidden>{0}</button></div>\n<div class="profile-editor-identity"><div class="profile-editor-avatar"><button type="button" class="profile-editor-pick" data-pick="avatar" aria-label="更换图片"><span data-avatar-slot>@</span></button><button type="button" class="profile-editor-remove" data-remove="avatar" aria-label="移除图片" title="移除图片" hidden>{1}</button></div>\n<div class="profile-editor-title"><h3 data-public-own-handle></h3><a data-public-page>查看我的公开个人资料</a></div></div>\n<label class="profile-editor-description"><span>简介</span><textarea data-public-description rows="3" placeholder="介绍一下自己。使用 @ 提及用户和社区。"></textarea><small data-description-count></small></label>\n<button type="button" class="primary" data-confirm-profile>确认更改</button><input type="file" data-pick-file accept="image/png,image/jpeg,image/webp" hidden></div>',
  ],
  'html.3b7e1f6a5e79': [
    '<form role="search" aria-label="Search users and communities"><label class="public-search-field">{0}<input type="search" placeholder="Search" aria-label="Search users and communities" maxlength="100" autocomplete="off" spellcheck="false" aria-expanded="false"></label></form><div class="public-search-results" hidden><p class="public-search-status" role="status"></p><div class="public-search-list"></div></div>',
    '<form role="search" aria-label="搜索用户与社区"><label class="public-search-field">{0}<input type="search" placeholder="搜索" aria-label="搜索用户与社区" maxlength="100" autocomplete="off" spellcheck="false" aria-expanded="false"></label></form><div class="public-search-results" hidden><p class="public-search-status" role="status"></p><div class="public-search-list"></div></div>',
  ],
  'html.2d4c3af2bfc7': [
    '<legend>What to notify</legend><label><input type="checkbox" data-push-messages checked> Messages and replies</label><label><input type="checkbox" data-push-calls checked> Calls</label><label><input type="checkbox" data-push-show-calls checked> Identify the alert as a voice call</label><p>Turn off the last option for a generic alert. The contact\'s name is never shown; lock screen and sound depend on your system.</p><button type="button">Save push preferences</button>',
    '<legend>通知内容</legend><label><input type="checkbox" data-push-messages checked> 消息与回复</label><label><input type="checkbox" data-push-calls checked> 通话</label><label><input type="checkbox" data-push-show-calls checked> 将通知标识为语音来电</label><p>关闭最后一个选项可使用通用通知。不会显示联系人姓名；锁屏显示和声音由系统控制。</p><button type="button">保存推送设置</button>',
  ],
  ' · Sem domínio vinculado. Emissor identificado pela wallet.': [
    ' · No linked domain. Issuer identified by wallet.',
    ' · 未关联域名。通过钱包识别签发者。',
  ],
  ' · {0}: {1}': [' · {0}: {1}', ' · {0}：{1}'],
  'html.3dee5155ad6c': [
    '<article class="card"><h2>Organizations and representatives</h2><p>Create an organization and issue signed authorizations. A website is optional; matching names do not verify an external brand.</p><p data-representative-notice role="status"></p><button type="button" data-representative-load>Open organizations and authorizations</button><div data-representative-list></div></article>',
    '<article class="card"><h2>组织与代表</h2><p>创建组织并签发已签名的授权。网站为选填；名称相同并不能证明外部品牌身份。</p><p data-representative-notice role="status"></p><button type="button" data-representative-load>打开组织与授权</button><div data-representative-list></div></article>',
  ],
  'html.198650fde984': [
    '<article class="card status-card"><h2>Status</h2><p data-status-notice role="status"></p><button data-status-refresh type="button">Refresh</button><div data-status-list></div><button data-status-more type="button" hidden>More statuses</button><section data-status-open aria-live="polite"></section></article><article class="card status-card"><h2>Your next status</h2><form data-status-compose><label>Text or caption<textarea data-status-text rows="3"></textarea></label><button data-status-emoji type="button">Choose emoji</button><input data-status-file type="file" accept="image/*" hidden aria-label="Status photo"><button data-status-attach type="button" class="media-picker-button" aria-label="Attach photo" title="Attach photo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7"/></svg></button><div data-status-preview></div><button data-status-clear-photo type="button">Remove photo</button><button data-status-publish class="primary" type="submit">Publish status</button><button data-status-cancel type="button" hidden>Cancel pending publication</button></form><p>Text and photos disappear after 24 hours and are excluded from backups.</p><details><summary>Who can see your next statuses</summary><p>All approved contacts can see by default. Uncheck anyone you want to exclude. New contacts are included in future publications.</p><p data-status-privacy-conflict hidden></p><div data-status-audience></div><button data-status-more-contacts type="button" hidden>More contacts</button><button data-status-save-audience type="button">Save privacy</button></details></article>',
    '<article class="card status-card"><h2>状态</h2><p data-status-notice role="status"></p><button data-status-refresh type="button">刷新</button><div data-status-list></div><button data-status-more type="button" hidden>更多状态</button><section data-status-open aria-live="polite"></section></article><article class="card status-card"><h2>你的下一条状态</h2><form data-status-compose><label>文字或说明<textarea data-status-text rows="3"></textarea></label><button data-status-emoji type="button">选择表情</button><input data-status-file type="file" accept="image/*" hidden aria-label="状态图片"><button data-status-attach type="button" class="media-picker-button" aria-label="附加图片" title="附加图片"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7"/></svg></button><div data-status-preview></div><button data-status-clear-photo type="button">移除图片</button><button data-status-publish class="primary" type="submit">发布状态</button><button data-status-cancel type="button" hidden>取消待发布内容</button></form><p>文字和图片在 24 小时后消失，不包含在备份中。</p><details><summary>谁可以查看你的后续状态</summary><p>默认所有已批准联系人均可查看。取消勾选要排除的人。新联系人将纳入后续发布。</p><p data-status-privacy-conflict hidden></p><div data-status-audience></div><button data-status-more-contacts type="button" hidden>更多联系人</button><button data-status-save-audience type="button">保存隐私设置</button></details></article>',
  ],
  'html.659a7a617631': [
    '<article class="card vault-card"><h2>Account storage</h2><progress data-vault-usage max="{0}" value="0" aria-label="Storage usage"></progress><p data-vault-quota></p><p data-vault-status role="status"></p><button data-vault-retry type="button" hidden>Try again</button></article>',
    '<article class="card vault-card"><h2>账户存储空间</h2><progress data-vault-usage max="{0}" value="0" aria-label="存储用量"></progress><p data-vault-quota></p><p data-vault-status role="status"></p><button data-vault-retry type="button" hidden>重试</button></article>',
  ],
  'html.a00be4e55c2e': [
    '<div class="vault-meter-row"><span>Vault</span><span data-vault-meter-label></span></div><progress max="{0}" aria-label="Vault usage"></progress>',
    '<div class="vault-meter-row"><span>保险库</span><span data-vault-meter-label></span></div><progress max="{0}" aria-label="保险库用量"></progress>',
  ],
  '. Escolha uma forma por sessão; para começar de novo, reinicie o comando.': [
    '. Choose one method per session; restart the command to begin again.',
    '。每个会话请选择一种方式；如需重新开始，请重启命令。',
  ],
  '. Uso local; nenhuma publicação deste ensaio foi aprovada.': [
    '. Local use; publication of this test has not been approved.',
    '。仅供本地使用；此测试尚未获准发布。',
  ],
  '0xDMme — ensaio local de recuperação': [
    '0xDMme — local recovery test',
    '0xDMme — 本地恢复测试',
  ],
  '0xDMme: mensageiro privado web em desenvolvimento.': [
    '0xDMme: a private web messenger in development.',
    '0xDMme：开发中的私密网页通信应用。',
  ],
  ': use somente contas e mensagens fictícias': [
    ': use fictional accounts and messages only',
    '：仅使用虚构账户和消息',
  ],
  'A assinatura exclusiva abre seu cofre. Confira a mensagem e assine somente se você iniciou este pedido. Nenhum código precisa ser guardado.':
    [
      'The exclusive signature opens your vault. Check the message and sign only if you started this request. No code needs to be kept.',
      '专用签名用于打开保险库。请核对消息，并仅在你发起此请求时签名。无需保存任何代码。',
    ],
  'A assinatura exclusiva deste ensaio permite abrir seu pacote. Trate-a como segredo; nunca a compartilhe. O laboratório não mostra, registra ou envia a assinatura.':
    [
      "This test's exclusive signature opens your package. Treat it as a secret; never share it. The laboratory does not display, record or send the signature.",
      '此测试的专用签名用于打开数据包。请将其视为秘密，切勿分享。实验环境不会显示、记录或发送签名。',
    ],
  'A chave temporária só é válida por cinco minutos e é apagada ao concluir, cancelar ou retomar uma prova expirada. Se o navegador for fechado, o registro pode permanecer até a próxima abertura. O retorno pode abrir outra aba ou o navegador padrão. Essa prova não demonstra suporte EVM nem fechamento de abas antigas da wallet.':
    [
      'The temporary key is valid for five minutes and is deleted on completion, cancellation or resuming an expired test. If the browser closes, the record may remain until the next visit. Returning may open another tab or your default browser. This test does not demonstrate EVM support or closing old wallet tabs.',
      '临时密钥有效期为五分钟，会在完成、取消或恢复已过期测试时删除。如果关闭浏览器，记录可能保留到下次打开。返回可能打开另一标签页或默认浏览器。此测试不证明支持 EVM，也不证明会关闭旧钱包标签页。',
    ],
  'Abrir comunidades ao lado': ['Open communities alongside', '在旁边打开社区'],
  'Abrir histórico localmente': ['Open history locally', '在本地打开历史'],
  'Abrir perfil e configurações': [
    'Open profile and settings',
    '打开个人资料与设置',
  ],
  'Artefatos Semaphore 4.13.0, árvore de profundidade 4, servidos neste mesmo laboratório. Nenhum segredo é enviado a um serviço externo.':
    [
      'Semaphore 4.13.0 artifacts, depth-4 tree, served by this laboratory. No secrets are sent to an external service.',
      'Semaphore 4.13.0 文件及深度为 4 的树由此实验环境提供。不会向外部服务发送任何密钥。',
    ],
  'Assinar recuperação': ['Sign recovery', '签署恢复请求'],
  'Assinaturas e chaves permanecem nos clientes; o retorno passa cifrado pelo servidor. Assinaturas diferentes da configuração impedem a recuperação.':
    [
      'Signatures and keys stay on clients; the return passes through the server encrypted. Signatures that differ from the original configuration prevent recovery.',
      '签名和密钥保留在客户端；返回结果以加密形式经过服务器。签名与初始配置不一致会导致无法恢复。',
    ],
  'Baixe o pacote e escolha esse arquivo para importar. Confira seu identificador e clique em Testar este pacote. Faça também o teste em um perfil limpo, usando a mesma origem e a conta original.':
    [
      'Download the package and select that file to import. Check its identifier and click Test this package. Also test in a clean browser profile, using the same origin and original account.',
      '请下载数据包并选择该文件导入。核对标识后点击“测试此数据包”。也请使用相同来源和原账户，在全新浏览器配置中测试。',
    ],
  'Buscar contatos e mensagens': [
    'Search contacts and messages',
    '搜索联系人与消息',
  ],
  'Buscar envelope do relay': [
    'Fetch envelope from relay',
    '从中继获取加密封装',
  ],
  'Chat em teste: use somente contas e mensagens fictícias.': [
    'Chat under test: use fictional accounts and messages only.',
    '聊天测试中：仅使用虚构账户和消息。',
  ],
  'Chave pública do outro cliente': [
    "Other client's public key",
    '另一客户端的公钥',
  ],
  'Cliente de teste': ['Test client', '测试客户端'],
  'Cliente de teste · Hash-Talk': [
    'Test client · 0xDMme',
    '测试客户端 · 0xDMme',
  ],
  'Cofre e recuperação': ['Vault and recovery', '保险库与恢复'],
  'Cofre e recuperação limpa': [
    'Vault and clean recovery',
    '保险库与全新环境恢复',
  ],
  'Confirme seu pedido na wallet.': [
    'Confirm your request in the wallet.',
    '请在钱包中确认请求。',
  ],
  'Confirmo o uso de uma wallet de teste e entendo que isto não protege dados reais.':
    [
      'I confirm I am using a test wallet and understand that this does not protect real data.',
      '我确认使用测试钱包，并理解这不能保护真实数据。',
    ],
  'Contatos e grupos': ['Contacts and groups', '联系人与群组'],
  'Contatos e perfil': ['Contacts and profile', '联系人与个人资料'],
  'Contatos, conversa e comunidades': [
    'Contacts, conversation and communities',
    '联系人、对话与社区',
  ],
  'Conteúdo e segredos pertencem aos seus dispositivos.': [
    'Content and secrets belong to your devices.',
    '内容和密钥属于你的设备。',
  ],
  'Copiar endereço completo da wallet': [
    'Copy full wallet address',
    '复制完整钱包地址',
  ],
  'Crie o ensaio. Confira que os dois pedidos têm exatamente a mesma mensagem.':
    [
      'Create the test. Check that both requests contain exactly the same message.',
      '请创建测试。确认两次请求的消息完全一致。',
    ],
  'Depois volte ao navegador original para concluir. Você escolhe lá quais aparelhos revogar.':
    [
      'Then return to the original browser to finish. Choose which devices to revoke there.',
      '然后返回原浏览器完成流程，并在那里选择撤销哪些设备。',
    ],
  'Desenhos e licenças dos emojis': [
    'Emoji artwork and licenses',
    '表情图案与许可证',
  ],
  'Ensaio local de recuperação': ['Local recovery test', '本地恢复测试'],
  'Ensaio pronto; nenhuma wallet real é necessária.': [
    'Test ready; no real wallet needed.',
    '测试已就绪；无需真实钱包。',
  ],
  'Enviar cifrada': ['Send encrypted', '加密发送'],
  'Esta prova solicita conexão e assinatura de uma mensagem de teste. Não cria uma conta, não envia transações e não acessa seu histórico.':
    [
      'This test requests a connection and a test message signature. It does not create an account, send transactions or access your history.',
      '此测试请求连接并签署测试消息。不会创建账户、发送交易或访问历史。',
    ],
  'Esta sessão é temporária: reiniciar o laboratório descarta mensagens e chaves. Ainda não é o chat do produto.':
    [
      "This session is temporary: restarting the laboratory discards messages and keys. It is not yet the product's chat.",
      '此会话为临时会话：重启实验环境会丢弃消息和密钥。它尚不是产品聊天功能。',
    ],
  'Fontes do motor de mensagens': [
    'Messaging engine sources',
    '消息引擎源代码',
  ],
  'Fontes e licenças desta versão': [
    'Sources and licenses for this version',
    '此版本的源代码与许可证',
  ],
  'Fontes e licenças: repositório local,': [
    'Sources and licenses: local repository,',
    '源代码与许可证：本地仓库，',
  ],
  'Gerar segredo fictício': ['Generate fictional secret', '生成虚构密钥'],
  'Geração e verificação ZK': [
    'ZK generation and verification',
    '零知识证明生成与验证',
  ],
  'Guardar envelope no relay': [
    'Store envelope on relay',
    '将加密封装存入中继',
  ],
  'Guarde o segredo para o teste; ele nunca é enviado ao relay. Abrir esta página em outro navegador e buscar o envelope permite testar a recuperação limpa.':
    [
      'Keep the secret for the test; it is never sent to the relay. Open this page in another browser and fetch the envelope to test recovery in a clean environment.',
      '请保留用于测试的密钥；密钥绝不会发送到中继。在另一浏览器中打开此页并获取加密封装，可以测试全新环境中的恢复。',
    ],
  'Hash-Talk · ensaio de cofre': ['0xDMme · vault test', '0xDMme · 保险库测试'],
  'Hash-Talk · laboratório de criptografia': [
    '0xDMme · cryptography laboratory',
    '0xDMme · 加密实验环境',
  ],
  'Histórico fictício recuperado em navegador limpo.': [
    'Fictional history recovered in a clean browser.',
    '虚构历史已在全新浏览器环境中恢复。',
  ],
  'Histórico recuperado': ['Recovered history', '已恢复历史'],
  'Importar pacote fictício cifrado, processado neste navegador': [
    'Import encrypted fictional package, processed in this browser',
    '导入加密虚构数据包，在此浏览器中处理',
  ],
  'Ir para o conteúdo': ['Skip to content', '跳转到内容'],
  'Laboratório de criptografia': ['Cryptography laboratory', '加密实验环境'],
  'Limite de 45 segundos; workers encerrados ao terminar ou sair. Os resultados não substituem medições em Android/iOS. A licença GPL-3.0 do gerador requer avaliação antes de distribuição do produto.':
    [
      "45-second limit; workers stop on completion or exit. Results do not replace Android/iOS measurements. The generator's GPL-3.0 license requires assessment before product distribution.",
      '限时 45 秒；完成或退出时停止工作线程。结果不能替代 Android/iOS 实测。产品分发前需要评估生成器的 GPL-3.0 许可证。',
    ],
  'Lista de conversas': ['Conversation list', '对话列表'],
  'Mensagem fictícia': ['Fictional message', '虚构消息'],
  'Mensagens públicas pelo @': ['Messages via @', '通过 @ 发送的私信'],
  'Minha chave pública': ['My public key', '我的公钥'],
  'Navegação principal': ['Main navigation', '主导航'],
  'Não lidas': ['Unread', '未读'],
  'O arquivo selecionado passa a ser o alvo da recuperação. Confira abaixo a conta e o identificador do pacote ativo.':
    [
      'The selected file becomes the recovery target. Check the account and active package identifier below.',
      '所选文件将成为恢复目标。请核对下方账户与当前数据包标识。',
    ],
  'O login será concluído na aba ou PWA que iniciou o pedido. Se o retorno abrir outra aba ou ficar nesta wallet, volte manualmente ao navegador original.':
    [
      'Sign-in completes in the tab or PWA that started the request. If the return opens another tab or stays in the wallet, manually return to the original browser.',
      '登录将在发起请求的标签页或 PWA 中完成。如果返回打开另一标签页或停留在钱包，请手动返回原浏览器。',
    ],
  'O relay é temporário. Backups históricos válidos podem ser abertos, mas não reautorizam aparelhos. Autenticação por wallet e defesa contra rollback de estado atual ficam para a integração.':
    [
      'The relay is temporary. Valid historical backups can be opened, but do not reauthorize devices. Wallet authentication and protection against current-state rollback are deferred to integration.',
      '中继为临时服务。有效历史备份可以打开，但不会重新授权设备。钱包认证及当前状态回滚保护将在集成阶段实现。',
    ],
  'Opções de grupos': ['Group options', '群组选项'],
  'Organização da tela': ['Screen layout', '界面布局'],
  'Preparando canal de teste…': [
    'Preparing test channel…',
    '正在准备测试通道…',
  ],
  'Pronto para medir neste navegador.': [
    'Ready to measure in this browser.',
    '可以在此浏览器中测量。',
  ],
  'Prova de retorno da Phantom · 0xDMme': [
    'Phantom return test · 0xDMme',
    'Phantom 返回测试 · 0xDMme',
  ],
  Públicos: ['Public', '公开'],
  'RECUPERAÇÃO PRIVADA': ['PRIVATE RECOVERY', '私密恢复'],
  'Recarregue esta página e clique em Testar este pacote.': [
    'Reload this page and click Test this package.',
    '请刷新此页并点击“测试此数据包”。',
  ],
  'Recolher comunidades': ['Collapse communities', '收起社区'],
  'Recuperação privada · 0xDMme': [
    'Private recovery · 0xDMme',
    '私密恢复 · 0xDMme',
  ],
  'Retorno da Phantom': ['Phantom return', 'Phantom 返回'],
  'Revisão do snapshot': ['Snapshot revision', '快照修订版本'],
  'Revogar outro dispositivo e testar rotação': [
    'Revoke another device and test rotation',
    '撤销其他设备授权并测试轮换',
  ],
  'Segredo fictício de recuperação': [
    'Fictional recovery secret',
    '虚构恢复密钥',
  ],
  'Selecione sua wallet de teste.': [
    'Select your test wallet.',
    '请选择测试钱包。',
  ],
  'Semaphore: pertencimento a um grupo de oito identidades fictícias. Não integra login, chat ou wallet e não demonstra anonimato neste grupo pequeno.':
    [
      'Semaphore: membership in a group of eight fictional identities. This does not integrate sign-in, chat or wallets, and does not demonstrate anonymity in this small group.',
      'Semaphore：证明属于包含八个虚构身份的群组。此测试不集成登录、聊天或钱包，也不证明此小群组中的匿名性。',
    ],
  'Seções das comunidades': ['Community sections', '社区分区'],
  'Somente dados fictícios e wallet de teste, sem fundos. Este laboratório não acessa sua conta ou seu cofre do 0xDMme.':
    [
      'Fictional data and an unfunded test wallet only. This laboratory does not access your 0xDMme account or vault.',
      '仅使用虚构数据和无资金的测试钱包。此实验环境不会访问你的 0xDMme 账户或保险库。',
    ],
  'Somente mensagens fictícias; armazenamento temporário.': [
    'Fictional messages only; temporary storage.',
    '仅使用虚构消息；临时存储。',
  ],
  'Só comunidades': ['Communities only', '仅社区'],
  'Só conversas': ['Conversations only', '仅对话'],
  'Testar conexão e retorno': ['Test connection and return', '测试连接与返回'],
  'Texto fictício do histórico': ['Fictional history text', '虚构历史文字'],
  'Tipo de contato': ['Contact type', '联系人类型'],
  'Troque a conta na wallet: recuperar deve recusar a conta diferente.': [
    'Switch accounts in the wallet: recovery must reject a different account.',
    '请在钱包中切换账户：恢复必须拒绝不同账户。',
  ],
  'Um resultado positivo aqui não comprova compatibilidade entre wallets, aparelhos ou futuras atualizações. O vínculo por QR e a recuperação atual permanecem no app.':
    [
      'A positive result here does not prove compatibility across wallets, devices or future updates. QR linking and current recovery remain in the app.',
      '此处成功不代表钱包、设备或未来更新之间的兼容性。应用仍保留二维码关联和现有恢复流程。',
    ],
  'Uma nova versão está pronta.': ['A new version is ready.', '新版本已就绪。'],
  'Use somente texto e segredo fictícios. Identidade sintética: Alice. Esta página não usa o estado dos clientes de mensagens.':
    [
      "Use fictional text and secrets only. Synthetic identity: Alice. This page does not use messaging clients' state.",
      '仅使用虚构文字和密钥。模拟身份：Alice。此页面不使用消息客户端状态。',
    ],
  'Use somente texto fictício. Compare as chaves das duas telas, autorize e envie uma mensagem.':
    [
      'Use fictional text only. Compare the keys on both screens, authorize and send a message.',
      '仅使用虚构文字。请比较两个页面上的密钥，授权后发送消息。',
    ],
  'Verificando conexão…': ['Checking connection…', '正在检查连接…'],
  'Wallet de teste': ['Test wallet', '测试钱包'],
  'Área do aplicativo': ['App workspace', '应用工作区'],
  'Atualização do idioma requer recarregar a tela. Resolva os rascunhos antes de continuar.':
    [
      'Changing language reloads the screen. Resolve your drafts before continuing.',
      '更改语言需要刷新界面。继续前请先处理草稿。',
    ],
  '@{0} respondeu · 0xDMme': ['@{0} replied · 0xDMme', '@{0} 回复了 · 0xDMme'],
  '@{0} publicou · 0xDMme': ['@{0} posted · 0xDMme', '@{0} 发布了 · 0xDMme'],
  'Há nova atividade. Abra o app para sincronizar.': [
    'New activity. Open the app to sync.',
    '有新动态。请打开应用以同步。',
  ],
  '@ inválido.': ['Invalid handle.', '用户名无效。'],
  'Aba de perfil inválida.': ['Invalid profile tab.', '个人资料标签页无效。'],
  'Abertura ausente.': ['Opening request missing.', '缺少打开请求。'],
  'Abertura de conta indisponível.': [
    'Account opening unavailable.',
    '账户打开流程不可用。',
  ],
  'Algoritmo de mensagem inválido.': [
    'Invalid message algorithm.',
    '消息算法无效。',
  ],
  'Algoritmo de sessão inválido.': [
    'Invalid session algorithm.',
    '会话算法无效。',
  ],
  'Alteração de grupo inválida.': ['Invalid group change.', '群组更改无效。'],
  'Alteração privada inválida.': ['Invalid private change.', '私密更改无效。'],
  'Alvo da denúncia indisponível.': [
    'Report target unavailable.',
    '举报对象不可用。',
  ],
  'Análise da mídia indisponível.': [
    'Media analysis unavailable.',
    '媒体分析不可用。',
  ],
  'Anexo incompleto.': ['Attachment incomplete.', '附件不完整。'],
  'Anexo indisponível.': ['Attachment unavailable.', '附件不可用。'],
  'Anexo integral divergente.': [
    'Full attachment does not match.',
    '完整附件不匹配。',
  ],
  'Aparelho de DM indisponível.': [
    'DM device unavailable.',
    '私信设备不可用。',
  ],
  'Armazenamento de anexos indisponível.': [
    'Attachment storage unavailable.',
    '附件存储不可用。',
  ],
  'Armazenamento de mídia indisponível.': [
    'Media storage unavailable.',
    '媒体存储不可用。',
  ],
  'Armazenamento de status indisponível.': [
    'Status storage unavailable.',
    '状态存储不可用。',
  ],
  'Árvore inválida.': ['Invalid tree.', '树结构无效。'],
  'Assinatura ausente.': ['Signature missing.', '缺少签名。'],
  'Assinatura da autorização inválida.': [
    'Invalid authorization signature.',
    '授权签名无效。',
  ],
  'Assinatura de grupo inválida.': [
    'Invalid group signature.',
    '群组签名无效。',
  ],
  'Assinatura de mensagem inválida.': [
    'Invalid message signature.',
    '消息签名无效。',
  ],
  'Assinatura de pacote inválida.': [
    'Invalid package signature.',
    '数据包签名无效。',
  ],
  'Assinatura Matrix inválida.': [
    'Invalid Matrix signature.',
    'Matrix 签名无效。',
  ],
  'Atividade compartilhada inválida.': [
    'Invalid shared activity.',
    '分享的动态无效。',
  ],
  'Atualização imediata indisponível.': [
    'Live update unavailable.',
    '实时更新不可用。',
  ],
  'Audiência de grupo inválida.': ['Invalid group audience.', '群组受众无效。'],
  'Audiência de status inválida.': [
    'Invalid status audience.',
    '状态受众无效。',
  ],
  'Autoridade da exclusão divergente.': [
    'Deletion authority does not match.',
    '删除授权不匹配。',
  ],
  'Autoridade histórica indisponível.': [
    'Historical authority unavailable.',
    '历史授权不可用。',
  ],
  'Autorização indisponível.': ['Authorization unavailable.', '授权不可用。'],
  'Autorização inválida.': ['Invalid authorization.', '授权无效。'],
  'Autorizações indisponíveis.': [
    'Authorizations unavailable.',
    '授权不可用。',
  ],
  'Avatar público inválido.': ['Invalid public avatar.', '公开头像无效。'],
  'Aviso de vídeo inválido.': ['Invalid video notice.', '视频通知无效。'],
  'Badge indisponível.': ['Badge unavailable.', '徽章不可用。'],
  'Badge inválido.': ['Invalid badge.', '徽章无效。'],
  'Badges inválidos.': ['Invalid badges.', '徽章无效。'],
  'Bloqueio indisponível.': ['Block unavailable.', '屏蔽记录不可用。'],
  'Busca de menções inválida.': ['Invalid mention search.', '提及搜索无效。'],
  'Caminho de aprovação inválido.': [
    'Invalid approval path.',
    '批准路径无效。',
  ],
  'Campos inválidos.': ['Invalid fields.', '字段无效。'],
  'Cápsula de identidade de DM inválida.': [
    'Invalid DM identity capsule.',
    '私信身份封装无效。',
  ],
  'Cápsula de recuperação corrompida.': [
    'Recovery capsule corrupted.',
    '恢复封装已损坏。',
  ],
  'Cápsula de recuperação inválida.': [
    'Invalid recovery capsule.',
    '恢复封装无效。',
  ],
  'Cartão excedido.': ['Card exceeds the limit.', '卡片超过限制。'],
  'Chamada indisponível.': ['Call unavailable.', '通话不可用。'],
  'Chamada inválida.': ['Invalid call.', '通话无效。'],
  'Chave histórica ausente.': ['Historical key missing.', '缺少历史密钥。'],
  'Chave Matrix de grupo divergente.': [
    'Group Matrix key does not match.',
    '群组 Matrix 密钥不匹配。',
  ],
  'Chave Matrix de origem divergente.': [
    'Source Matrix key does not match.',
    '来源 Matrix 密钥不匹配。',
  ],
  'Chave Matrix inválida.': ['Invalid Matrix key.', 'Matrix 密钥无效。'],
  'Chave ou assinatura de status inválida.': [
    'Invalid status key or signature.',
    '状态密钥或签名无效。',
  ],
  'Chaves de inscrição inválidas.': [
    'Invalid subscription keys.',
    '订阅密钥无效。',
  ],
  'Ciphertext Matrix inválido.': [
    'Invalid Matrix ciphertext.',
    'Matrix 密文无效。',
  ],
  'Classificação inválida.': ['Invalid classification.', '分类无效。'],
  'Cobertura de análise incompleta.': [
    'Analysis coverage incomplete.',
    '分析覆盖范围不完整。',
  ],
  'Codificação inválida.': ['Invalid encoding.', '编码无效。'],
  'Código ou chaves divergentes.': [
    'Code or keys do not match.',
    '代码或密钥不匹配。',
  ],
  'Compartilhamento indisponível.': ['Share unavailable.', '分享不可用。'],
  'Comunidade do feed inválida.': [
    'Invalid feed community.',
    '动态中的社区无效。',
  ],
  'Comunidade pública inválida.': [
    'Invalid public community.',
    '公开社区无效。',
  ],
  'Configuração de recuperação inválida.': [
    'Invalid recovery configuration.',
    '恢复配置无效。',
  ],
  'Configuração inválida.': ['Invalid configuration.', '配置无效。'],
  'Confirmação da wallet ou autorização do aparelho ausente.': [
    'Wallet confirmation or device authorization missing.',
    '缺少钱包确认或设备授权。',
  ],
  'Confirmação de DM divergente.': [
    'DM confirmation does not match.',
    '私信确认不匹配。',
  ],
  'Confirmação de DMs excedida.': [
    'DM confirmations exceeds the limit.',
    '私信确认超过限制。',
  ],
  'Conta Matrix inválida.': ['Invalid Matrix account.', 'Matrix 账户无效。'],
  'Contabilização do cofre de grupo inválida.': [
    'Invalid group vault accounting.',
    '群组保险库计量无效。',
  ],
  'Contagem inválida.': ['Invalid count.', '计数无效。'],
  'Contagens inválidas.': ['Invalid counts.', '计数无效。'],
  'Contato indisponível.': ['Contact unavailable.', '联系人不可用。'],
  'Contestação indisponível.': ['Appeal unavailable.', '申诉不可用。'],
  'Conteúdo da exclusão divergente.': [
    'Deletion content does not match.',
    '删除内容不匹配。',
  ],
  'Contexto da resposta inválido.': [
    'Invalid reply context.',
    '回复上下文无效。',
  ],
  'Contexto de análise inválido.': [
    'Invalid analysis context.',
    '分析上下文无效。',
  ],
  'Contexto inválido.': ['Invalid context.', '上下文无效。'],
  'Controles do grupo indisponíveis.': [
    'Group controls unavailable.',
    '群组控制项不可用。',
  ],
  'Convite de grupo indisponível.': [
    'Group invitation unavailable.',
    '群组邀请不可用。',
  ],
  'Convite ou transferência inválidos.': [
    'Invalid invitation or transfer.',
    '邀请或转让无效。',
  ],
  'Cookie de aprovação inválido.': [
    'Invalid approval cookie.',
    '批准 Cookie无效。',
  ],
  'Corpo inválido.': ['Invalid body.', '请求正文无效。'],
  'Cursor da discussão inválido.': [
    'Invalid discussion cursor.',
    '讨论游标无效。',
  ],
  'Cursor de descoberta inválido.': [
    'Invalid discovery cursor.',
    '发现游标无效。',
  ],
  'Cursor de posts inválido.': ['Invalid post cursor.', '帖子游标无效。'],
  'Cursor de ranking inválido.': [
    'Invalid ranking cursor.',
    '排行榜游标无效。',
  ],
  'Cursor inválido.': ['Invalid cursor.', '游标无效。'],
  'Dados inválidos.': ['Invalid data.', '数据无效。'],
  'Data da comunidade inválida.': ['Invalid community date.', '社区日期无效。'],
  'Decisão de análise inválida.': [
    'Invalid analysis decision.',
    '分析决定无效。',
  ],
  'Decisão inválida.': ['Invalid decision.', '决定无效。'],
  'Denúncia indisponível.': ['Report unavailable.', '举报不可用。'],
  'Desafio de domínio ausente.': [
    'Domain challenge missing.',
    '缺少域名验证请求。',
  ],
  'Desafio de retorno inválido.': [
    'Invalid return challenge.',
    '返回验证请求无效。',
  ],
  'Desafio inválido.': ['Invalid challenge.', '验证请求无效。'],
  'Descoberta indisponível.': ['Discovery unavailable.', '发现设置不可用。'],
  'Descrição de áudio inválida.': [
    'Invalid audio description.',
    '音频描述无效。',
  ],
  'Descrição inválida.': ['Invalid description.', '简介无效。'],
  'Destinatário de status divergente.': [
    'Status recipient does not match.',
    '状态接收者不匹配。',
  ],
  'Destinatário de status inválido.': [
    'Invalid status recipient.',
    '状态接收者无效。',
  ],
  'Destinatários de mensagem divergentes.': [
    'Message recipients do not match.',
    '消息接收者不匹配。',
  ],
  'Destinatários excedidos.': [
    'Recipients exceed the limit.',
    '接收者超过限制。',
  ],
  'Destinatários ou origem de grupo divergentes.': [
    'Recipients or group origin do not match.',
    '接收者或群组来源不匹配。',
  ],
  'Destino criptográfico divergente.': [
    'Cryptographic destination does not match.',
    '加密目标不匹配。',
  ],
  'Destino de abertura inválido.': [
    'Invalid opening destination.',
    '打开目标无效。',
  ],
  'Destino de recuperação inválido.': [
    'Invalid recovery destination.',
    '恢复目标无效。',
  ],
  'Diretório de aparelho ausente.': [
    'Device directory missing.',
    '缺少设备目录。',
  ],
  'Diretório de grupo inválido.': [
    'Invalid group directory.',
    '群组目录无效。',
  ],
  'Diretório de participante indisponível.': [
    'Participant directory unavailable.',
    '成员目录不可用。',
  ],
  'Diretório inválido.': ['Invalid directory.', '目录无效。'],
  'Disponibilidade inválida.': ['Invalid availability.', '可用性无效。'],
  'Documento de aprovação indisponível.': [
    'Approval document unavailable.',
    '批准文档不可用。',
  ],
  'Documento de aprovação inválido.': [
    'Invalid approval document.',
    '批准文档无效。',
  ],
  'Documento excedido.': ['Document exceeds the limit.', '文档超过限制。'],
  'Domínio inválido.': ['Invalid domain.', '域名无效。'],
  'Domínio público inválido.': ['Invalid public domain.', '公开域名无效。'],
  'Duração inválida.': ['Invalid duration.', '时长无效。'],
  'Ecossistema inválido.': ['Invalid ecosystem.', '生态系统无效。'],
  'Emissor/contexto divergente.': [
    'Issuer/context does not match.',
    '签发者或上下文不匹配。',
  ],
  'Endereço relay inválido.': ['Invalid relay address.', '中继地址无效。'],
  'Endpoint inválido.': ['Invalid endpoint.', '端点无效。'],
  'Entrada por link inválida.': ['Invalid link entry.', '链接入口无效。'],
  'Envelope de retorno excedido.': [
    'Return envelope exceeds the limit.',
    '返回封装超过限制。',
  ],
  'Envelope do cofre inválido.': [
    'Invalid vault envelope.',
    '保险库封装无效。',
  ],
  'Época de recuperação inválida.': [
    'Invalid recovery epoch.',
    '恢复周期无效。',
  ],
  'Época ou revisão inválida.': [
    'Invalid epoch or revision.',
    '周期或修订版本无效。',
  ],
  'Erro de mídia inválido.': ['Invalid media error.', '媒体错误无效。'],
  'Escolha inválida.': ['Invalid choice.', '选项无效。'],
  'Estado de análise inválido.': ['Invalid analysis state.', '分析状态无效。'],
  'Estado de chamada inválido.': ['Invalid call state.', '通话状态无效。'],
  'Estado de mensagens ausente.': ['Message state missing.', '缺少消息状态。'],
  'Estado de mídia inválido.': ['Invalid media state.', '媒体状态无效。'],
  'Estado do post inválido.': ['Invalid post state.', '帖子状态无效。'],
  'Estado inválido.': ['Invalid state.', '状态无效。'],
  'Fallback Matrix inválido.': [
    'Invalid Matrix fallback key.',
    'Matrix 备用密钥无效。',
  ],
  'Feed inválido.': ['Invalid feed.', '动态无效。'],
  'Filtros inválidos.': ['Invalid filters.', '筛选条件无效。'],
  'Fingerprint de mídia ausente.': [
    'Media fingerprint missing.',
    '缺少媒体指纹。',
  ],
  'Formato de foto preparada inválido.': [
    'Invalid prepared photo format.',
    '已处理图片格式无效。',
  ],
  'Formato do cofre inválido.': ['Invalid vault format.', '保险库格式无效。'],
  'Foto integral divergente.': [
    'Full photo does not match.',
    '完整图片不匹配。',
  ],
  'Função de grupo inválida.': ['Invalid group role.', '群组角色无效。'],
  'Função inválida.': ['Invalid role.', '角色无效。'],
  'Função pública inválida.': ['Invalid public role.', '公开角色无效。'],
  'Horário de admissão inválido.': [
    'Invalid admission time.',
    '接纳时间无效。',
  ],
  'Horário do post inválido.': ['Invalid post time.', '帖子时间无效。'],
  'Identidade de vinculação divergente.': [
    'Linking identity does not match.',
    '关联身份不匹配。',
  ],
  'Identidade Matrix divergente.': [
    'Matrix identity does not match.',
    'Matrix 身份不匹配。',
  ],
  'Identidade ou rede da wallet inválida.': [
    'Invalid wallet identity or network.',
    '钱包身份或网络无效。',
  ],
  'Identificador de chave inválido.': [
    'Invalid key identifier.',
    '密钥标识无效。',
  ],
  'Identificador inválido.': ['Invalid identifier.', '标识无效。'],
  'Inspeção da mídia indisponível.': [
    'Media inspection unavailable.',
    '媒体检查不可用。',
  ],
  'Janela de criação inválida.': ['Invalid creation window.', '创建窗口无效。'],
  'JSON inválido.': ['Invalid JSON.', 'JSON无效。'],
  'Link de grupo inválido.': ['Invalid group link.', '群组链接无效。'],
  'Lista de posts inválida.': ['Invalid post list.', '帖子列表无效。'],
  'Lista de seguidores inválida.': [
    'Invalid follower list.',
    '关注者列表无效。',
  ],
  'Lista inválida.': ['Invalid list.', '列表无效。'],
  'Lote de chaves de DMs excedido.': [
    'DM key batch exceeds the limit.',
    '私信密钥批次超过限制。',
  ],
  'Lote de chaves excedido.': [
    'Key batch exceeds the limit.',
    '密钥批次超过限制。',
  ],
  'Lote de chaves Matrix excedido.': [
    'Matrix key batch exceeds the limit.',
    'Matrix 密钥批次超过限制。',
  ],
  'Lote de confirmações inválido.': [
    'Invalid confirmation batch.',
    '确认批次无效。',
  ],
  'Lote de consulta de chaves excedido.': [
    'Key lookup batch exceeds the limit.',
    '密钥查询批次超过限制。',
  ],
  'Lote de contatos excedido.': [
    'Contact batch exceeds the limit.',
    '联系人批次超过限制。',
  ],
  'Lote de diretórios excedido.': [
    'Directory batch exceeds the limit.',
    '目录批次超过限制。',
  ],
  'Lote de envelopes excedido.': [
    'Envelope batch exceeds the limit.',
    '封装批次超过限制。',
  ],
  'Lote de envelopes inválido.': ['Invalid envelope batch.', '封装批次无效。'],
  'Lote de grupos inválido.': ['Invalid group batch.', '群组批次无效。'],
  'Lote de limpeza excedido.': [
    'Cleanup batch exceeds the limit.',
    '清理批次超过限制。',
  ],
  'Lote de mensagens inválido.': ['Invalid message batch.', '消息批次无效。'],
  'Lote de participantes inválido.': [
    'Invalid participant batch.',
    '成员批次无效。',
  ],
  'Lote de períodos excedido.': [
    'Period batch exceeds the limit.',
    '时段批次超过限制。',
  ],
  'Lote de recebimento inválido.': ['Invalid receipt batch.', '接收批次无效。'],
  'Lote de recuperação excedido.': [
    'Recovery batch exceeds the limit.',
    '恢复批次超过限制。',
  ],
  'Lote de sessões excedido.': [
    'Session batch exceeds the limit.',
    '会话批次超过限制。',
  ],
  'Lote de visualizações excedido.': [
    'View batch exceeds the limit.',
    '浏览批次超过限制。',
  ],
  'Lote de visualizações inválido.': ['Invalid view batch.', '浏览批次无效。'],
  'Lote inválido.': ['Invalid batch.', '批次无效。'],
  'Marca de visualização inválida.': ['Invalid view marker.', '浏览标记无效。'],
  'Menções indisponíveis.': ['Mentions unavailable.', '提及不可用。'],
  'Mensagem de grupo excedida.': [
    'Group message exceeds the limit.',
    '群组消息超过限制。',
  ],
  'Mensagem e recuperação de grupo divergentes.': [
    'Group message and recovery do not match.',
    '群组消息与恢复信息不匹配。',
  ],
  'Mensagem original divergente.': [
    'Original message does not match.',
    '原始消息不匹配。',
  ],
  'Mensagem original indisponível.': [
    'Original message unavailable.',
    '原始消息不可用。',
  ],
  'Mensagem própria indisponível.': [
    'Own message unavailable.',
    '自己的消息不可用。',
  ],
  'Metadados de aprovação inválidos.': [
    'Invalid approval metadata.',
    '批准元数据无效。',
  ],
  'Metadados de mídia inválidos.': [
    'Invalid media metadata.',
    '媒体元数据无效。',
  ],
  'Método inválido.': ['Invalid method.', '方法无效。'],
  'Mídia de DM indisponível.': ['DM media unavailable.', '私信媒体不可用。'],
  'Mídia de status indisponível.': [
    'Status media unavailable.',
    '状态媒体不可用。',
  ],
  'Mídia do grupo indisponível.': [
    'Group media unavailable.',
    '群组媒体不可用。',
  ],
  'Mídia indisponível.': ['Media unavailable.', '媒体不可用。'],
  'Mídia integral divergente.': [
    'Full media does not match.',
    '完整媒体不匹配。',
  ],
  'Mídia pública inválida.': ['Invalid public media.', '公开媒体无效。'],
  'Miniatura inválida.': ['Invalid thumbnail.', '缩略图无效。'],
  'Modo de aprovação inválido.': ['Invalid approval mode.', '批准模式无效。'],
  'Negociação inválida.': ['Invalid negotiation.', '协商无效。'],
  'Nome da comunidade inválido.': ['Invalid community name.', '社区名称无效。'],
  'Nome da menção inválido.': ['Invalid mention name.', '提及名称无效。'],
  'Nome inválido.': ['Invalid name.', '名称无效。'],
  'Notificações indisponíveis.': ['Notifications unavailable.', '通知不可用。'],
  'Número do cofre inválido.': ['Invalid vault number.', '保险库编号无效。'],
  'Objeto de análise inválido.': ['Invalid analysis object.', '分析对象无效。'],
  'Objeto de limpeza inválido.': ['Invalid cleanup object.', '清理对象无效。'],
  'Opção de DM inválida.': ['Invalid DM option.', '私信选项无效。'],
  'Operação da comunidade indisponível.': [
    'Community operation unavailable.',
    '社区操作不可用。',
  ],
  'Operação de badge inválida.': ['Invalid badge operation.', '徽章操作无效。'],
  'Operação de chamada indisponível.': [
    'Call operation unavailable.',
    '通话操作不可用。',
  ],
  'Operação de DM indisponível.': [
    'DM operation unavailable.',
    '私信操作不可用。',
  ],
  'Operação de grupo indisponível.': [
    'Group operation unavailable.',
    '群组操作不可用。',
  ],
  'Operação de mensagem indisponível.': [
    'Message operation unavailable.',
    '消息操作不可用。',
  ],
  'Operação de mídia indisponível.': [
    'Media operation unavailable.',
    '媒体操作不可用。',
  ],
  'Operação de post indisponível.': [
    'Post operation unavailable.',
    '帖子操作不可用。',
  ],
  'Operação de status indisponível.': [
    'Status operation unavailable.',
    '状态操作不可用。',
  ],
  'Operação de tag indisponível.': [
    'Tag operation unavailable.',
    '标签操作不可用。',
  ],
  'Operação diária indisponível.': [
    'Daily operation unavailable.',
    '每日操作不可用。',
  ],
  'Ordenação da discussão inválida.': [
    'Invalid discussion ordering.',
    '讨论排序无效。',
  ],
  'Ordenação inválida.': ['Invalid ordering.', '排序无效。'],
  'Organização adulterada.': ['Organization tampered with.', '组织遭到篡改。'],
  'Organização indisponível.': ['Organization unavailable.', '组织不可用。'],
  'Organização inválida.': ['Invalid organization.', '组织无效。'],
  'Origem da autorização inválida.': [
    'Invalid authorization origin.',
    '授权来源无效。',
  ],
  'Origem da menção inválida.': ['Invalid mention origin.', '提及来源无效。'],
  'Origem da recuperação ausente.': [
    'Recovery origin missing.',
    '缺少恢复来源。',
  ],
  'Origem de aprovação inválida.': [
    'Invalid approval origin.',
    '批准来源无效。',
  ],
  'Origem de mídia inválida.': ['Invalid media origin.', '媒体来源无效。'],
  'Origem de recuperação inválida.': [
    'Invalid recovery origin.',
    '恢复来源无效。',
  ],
  'Origem de status divergente.': [
    'Status origin does not match.',
    '状态来源不匹配。',
  ],
  'Origem de visualização inválida.': [
    'Invalid view origin.',
    '浏览来源无效。',
  ],
  'Pacote de grupo inválido.': ['Invalid group package.', '群组数据包无效。'],
  'Pacote de mensagem inválido.': [
    'Invalid message package.',
    '消息数据包无效。',
  ],
  'Página da comunidade inválida.': [
    'Invalid community page.',
    '社区页面无效。',
  ],
  'Página de audiência excedida.': [
    'Audience page exceeds the limit.',
    '受众页面超过限制。',
  ],
  'Página de destinatários inválida.': [
    'Invalid recipient page.',
    '接收者页面无效。',
  ],
  'Página de DMs inválida.': ['Invalid DM page.', '私信页面无效。'],
  'Página de menções inválida.': ['Invalid mention page.', '提及页面无效。'],
  'Página de mídia excedida.': [
    'Media page exceeds the limit.',
    '媒体页面超过限制。',
  ],
  'Página de recuperação indisponível.': [
    'Recovery page unavailable.',
    '恢复页面不可用。',
  ],
  'Página inválida.': ['Invalid page.', '页面无效。'],
  'Página pública indisponível.': [
    'Public page unavailable.',
    '公开页面不可用。',
  ],
  'Parte de mídia divergente.': [
    'Media part does not match.',
    '媒体分片不匹配。',
  ],
  'Parte inválida.': ['Invalid part.', '分片无效。'],
  'Partes de anexo inválidas.': ['Invalid attachment parts.', '附件分片无效。'],
  'Participação indisponível.': ['Membership unavailable.', '成员身份不可用。'],
  'Pedido de retorno inválido.': ['Invalid return request.', '返回请求无效。'],
  'Pedido de wallet inválido.': ['Invalid wallet request.', '钱包请求无效。'],
  'Perfil cifrado inválido.': [
    'Invalid encrypted profile.',
    '加密个人资料无效。',
  ],
  'Período inválido.': ['Invalid period.', '时段无效。'],
  'Política de análise inválida.': [
    'Invalid analysis policy.',
    '分析政策无效。',
  ],
  'Post indisponível.': ['Post unavailable.', '帖子不可用。'],
  'Prazo da autorização inválido.': [
    'Invalid authorization deadline.',
    '授权期限无效。',
  ],
  'Prazo de análise inválido.': [
    'Invalid analysis deadline.',
    '分析期限无效。',
  ],
  'Preferência de chamadas inválida.': [
    'Invalid call preference.',
    '通话设置无效。',
  ],
  'Preferência indisponível.': ['Preference unavailable.', '偏好设置不可用。'],
  'Preferências push inválidas.': [
    'Invalid push preferences.',
    '推送设置无效。',
  ],
  'Preservação da mídia de DMs indisponível.': [
    'DM media preservation unavailable.',
    '私信媒体保留不可用。',
  ],
  'Prévia de resposta inválida.': ['Invalid reply preview.', '回复预览无效。'],
  'Processador indisponível.': ['Processor unavailable.', '处理器不可用。'],
  'Processador isolado indisponível.': [
    'Isolated processor unavailable.',
    '隔离处理器不可用。',
  ],
  'Propriedade do grupo divergente.': [
    'Group ownership does not match.',
    '群组所有权不匹配。',
  ],
  'Quantidade de mídia inválida.': [
    'Invalid media quantity.',
    '媒体数量无效。',
  ],
  'Quantidade de quadros inválida.': ['Invalid frame quantity.', '帧数无效。'],
  'Recuperação de grupo excedida.': [
    'Group recovery exceeds the limit.',
    '群组恢复信息超过限制。',
  ],
  'Recuperação de grupo inválida.': [
    'Invalid group recovery.',
    '群组恢复信息无效。',
  ],
  'Referência de avatar inválida.': [
    'Invalid avatar reference.',
    '头像引用无效。',
  ],
  'Referência de notificação inválida.': [
    'Invalid notification reference.',
    '通知引用无效。',
  ],
  'Referência de recuperação divergente.': [
    'Recovery reference does not match.',
    '恢复引用不匹配。',
  ],
  'Referências de anexo inválidas.': [
    'Invalid attachment references.',
    '附件引用无效。',
  ],
  'Referências de status divergentes.': [
    'Status references do not match.',
    '状态引用不匹配。',
  ],
  'Referências do envio divergentes.': [
    'Send references do not match.',
    '发送引用不匹配。',
  ],
  'Registro de criação inválido.': [
    'Invalid creation record.',
    '创建记录无效。',
  ],
  'Relação de DM inválida.': ['Invalid DM relationship.', '私信关系无效。'],
  'Relação de mensagem inválida.': [
    'Invalid message relationship.',
    '消息关系无效。',
  ],
  'Remoção indisponível.': ['Removal unavailable.', '移除记录不可用。'],
  'Reserva de anexo divergente.': [
    'Attachment reservation does not match.',
    '附件预留不匹配。',
  ],
  'Reserva de anexo indisponível.': [
    'Attachment reservation unavailable.',
    '附件预留不可用。',
  ],
  'Reserva de mídia de DM divergente.': [
    'DM media reservation does not match.',
    '私信媒体预留不匹配。',
  ],
  'Reserva de mídia de DM indisponível.': [
    'DM media reservation unavailable.',
    '私信媒体预留不可用。',
  ],
  'Reserva de mídia divergente.': [
    'Media reservation does not match.',
    '媒体预留不匹配。',
  ],
  'Reserva de status divergente.': [
    'Status reservation does not match.',
    '状态预留不匹配。',
  ],
  'Respostas indisponíveis.': ['Replies unavailable.', '回复不可用。'],
  'Resultado de análise inválido.': [
    'Invalid analysis result.',
    '分析结果无效。',
  ],
  'Resultado de mídia inválido.': ['Invalid media result.', '媒体结果无效。'],
  'Resultado de vídeo inválido.': ['Invalid video result.', '视频结果无效。'],
  'Retorno de abertura excedido.': [
    'Opening return exceeds the limit.',
    '打开返回结果超过限制。',
  ],
  'Retry de envelope divergente.': [
    'Envelope retry does not match.',
    '封装重试不匹配。',
  ],
  'Revisão da comunidade inválida.': [
    'Invalid community revision.',
    '社区修订版本无效。',
  ],
  'Revisão de DM inválida.': ['Invalid DM revision.', '私信修订版本无效。'],
  'Revisão de status inválida.': [
    'Invalid status revision.',
    '状态修订版本无效。',
  ],
  'Revisão do grupo inválida.': [
    'Invalid group revision.',
    '群组修订版本无效。',
  ],
  'Revisão inválida.': ['Invalid revision.', '修订版本无效。'],
  'Sanção indisponível.': ['Sanction unavailable.', '处罚不可用。'],
  'Seguidores em comum inválidos.': [
    'Invalid mutual followers.',
    '共同关注者无效。',
  ],
  'Seguidores inválidos.': ['Invalid followers.', '关注者无效。'],
  'Seleção de limpeza divergente.': [
    'Cleanup selection does not match.',
    '清理选择不匹配。',
  ],
  'Seleção de mídia inválida.': ['Invalid media selection.', '媒体选择无效。'],
  'Sessão inválida.': ['Invalid session.', '会话无效。'],
  'Status inválido.': ['Invalid status.', '状态无效。'],
  'Streams inválidos.': ['Invalid streams.', '数据流无效。'],
  'Sugestões inválidas.': ['Invalid suggestions.', '建议无效。'],
  'Tamanho de parte divergente.': [
    'Part size does not match.',
    '分片大小不匹配。',
  ],
  'Texto da comunidade inválido.': [
    'Invalid community text.',
    '社区文字无效。',
  ],
  'Texto inválido.': ['Invalid text.', '文字无效。'],
  'Tipo de denúncia inválido.': ['Invalid report type.', '举报类型无效。'],
  'Tipo de mídia inválido.': ['Invalid media type.', '媒体类型无效。'],
  'Tipo de notificação inválido.': [
    'Invalid notification type.',
    '通知类型无效。',
  ],
  'Tipo declarado de mídia de DM inválido.': [
    'Invalid declared DM media type.',
    '声明的私信媒体类型无效。',
  ],
  'Tipo Olm inválido.': ['Invalid Olm type.', 'Olm 类型无效。'],
  'Transferência de DM incompleta.': [
    'DM transfer incomplete.',
    '私信传输不完整。',
  ],
  'Transferência de DMs indisponível.': [
    'DM transfers unavailable.',
    '私信传输不可用。',
  ],
  'Transporte ICE inválido.': ['Invalid ICE transport.', 'ICE 传输无效。'],
  'Transporte individual inválido.': [
    'Invalid individual transport.',
    '一对一传输无效。',
  ],
  'Upload incompleto.': ['Upload incomplete.', '上传不完整。'],
  'Versão de recuperação inválida.': [
    'Invalid recovery version.',
    '恢复版本无效。',
  ],
  'Versão inválida.': ['Invalid version.', '版本无效。'],
  'Vínculo de recuperação divergente.': [
    'Recovery binding does not match.',
    '恢复绑定不匹配。',
  ],
  'Vínculo Matrix inválido.': ['Invalid Matrix binding.', 'Matrix 绑定无效。'],
  'Visibilidade inválida.': ['Invalid visibility.', '可见性无效。'],
  'Visualizações indisponíveis.': ['Views unavailable.', '浏览记录不可用。'],
  'Voto inválido.': ['Invalid vote.', '投票无效。'],
  'Wallet de aprovação inválida.': [
    'Invalid approval wallet.',
    '批准钱包无效。',
  ],
  'Wallet emissora divergente.': [
    'Issuing wallet does not match.',
    '签发钱包不匹配。',
  ],
  'A abertura expirou ou foi interrompida. Inicie novamente.': [
    'Opening expired or was interrupted. Start again.',
    '打开流程已过期或中断。请重新开始。',
  ],
  'A base mobile exige rede privada.': [
    'The mobile environment requires a private network.',
    '手机环境需要私有网络。',
  ],
  'A comunidade mudou. Recarregue antes de continuar.': [
    'The community changed. Reload before continuing.',
    '社区已更改。请刷新后继续。',
  ],
  'A conta mudou durante a entrada. Inicie novamente.': [
    'The account changed during sign-in. Start again.',
    '登录期间账户已更改。请重新开始。',
  ],
  'A contestação já foi registrada.': [
    'The appeal has already been recorded.',
    '申诉已记录。',
  ],
  'A descrição aceita até {0} caracteres.': [
    'The description allows up to {0} characters.',
    '简介最多允许 {0} 个字符。',
  ],
  'A descrição aceita até cinco linhas.': [
    'The description allows up to five lines.',
    '简介最多允许五行。',
  ],
  'A descrição tem caracteres invisíveis.': [
    'The description contains invisible characters.',
    '简介含有不可见字符。',
  ],
  'A escolha de seguir mudou. Recarregue antes de tentar novamente.': [
    'Your follow choice changed. Reload before retrying.',
    '关注选项已更改。请刷新后重试。',
  ],
  'A postagem só pode ser editada na primeira hora.': [
    'Posts can only be edited within the first hour.',
    '帖子只能在发布后一小时内编辑。',
  ],
  'A preparação alterou a duração.': [
    'Preparation changed the duration.',
    '处理改变了时长。',
  ],
  'A recuperação pertence a outra conta ou origem.': [
    'Recovery belongs to another account or origin.',
    '恢复信息属于另一个账户或来源。',
  ],
  'A revisão deve preservar a proibição global de conteúdo explícito.': [
    'Review must preserve the global ban on explicit content.',
    '复核必须保留对露骨内容的全局禁止规则。',
  ],
  'A tag mudou. Recarregue antes de continuar.': [
    'The tag changed. Reload before continuing.',
    '标签已更改。请刷新后继续。',
  ],
  'A wallet ainda não concluiu a abertura das chaves.': [
    'The wallet has not finished opening the keys.',
    '钱包尚未完成打开密钥。',
  ],
  'Abertura encerrada ou divergente.': [
    'Opening ended or does not match.',
    '打开流程已结束或不匹配。',
  ],
  'Abertura indisponível para este navegador.': [
    'Opening unavailable for this browser.',
    '此浏览器无法使用打开流程。',
  ],
  'Aceite de outra autorização.': [
    'Acceptance belongs to another authorization.',
    '接受记录属于其他授权。',
  ],
  'Aguarde a transferência ativa terminar.': [
    'Wait for the active transfer to finish.',
    '请等待当前传输完成。',
  ],
  'Alteração não permitida.': ['Change not allowed.', '不允许此更改。'],
  'Análise indisponível para esta conta.': [
    'Analysis unavailable for this account.',
    '此账户无法使用分析。',
  ],
  'Análise substituída, interrompida ou expirada.': [
    'Analysis superseded, interrupted or expired.',
    '分析已被替代、中断或过期。',
  ],
  'Anexo não está integralmente preservado.': [
    'Attachment not fully preserved.',
    '附件未完整保留。',
  ],
  'Anexo ocupado.': ['Attachment busy.', '附件正在使用中。'],
  'Anexo removido do cofre pessoal.': [
    'Attachment removed from the personal vault.',
    '附件已从个人保险库中移除。',
  ],
  'Aparelho destinatário revogado.': [
    'Recipient device revoked.',
    '接收设备授权已撤销。',
  ],
  'Aparelho divergente do código.': [
    'Device differs from the code.',
    '设备与代码不一致。',
  ],
  'Aparelho não autorizado ao cofre.': [
    'Device not authorized for the vault.',
    '设备未获保险库访问授权。',
  ],
  'Aparelho não autorizado.': ['Device not authorized.', '设备未获授权。'],
  'Aparelho repetido no lote.': [
    'Device repeated in the batch.',
    '批次中设备重复。',
  ],
  'Aparelho sem autorização atual.': [
    'Device has no current authorization.',
    '设备缺少当前授权。',
  ],
  'Aparelho sem autorização.': [
    'Device has no authorization.',
    '设备缺少授权。',
  ],
  'Aparelho sem identidade de DM atual.': [
    'Device has no current DM identity.',
    '设备缺少当前私信身份。',
  ],
  'Aparelhos das DMs precisam ser atualizados pelo participante.': [
    'The participant must update DM devices.',
    '成员需要更新私信设备。',
  ],
  'Aparelhos mudaram durante o envio. Refaça a cifragem.': [
    'Devices changed during sending. Encrypt again.',
    '发送期间设备已更改。请重新加密。',
  ],
  'Arquivo vazio.': ['Empty file.', '文件为空。'],
  'Assinatura de login inválida ou expirada.': [
    'Sign-in signature invalid or expired.',
    '登录签名无效或已过期。',
  ],
  'Assinatura pertence a outro aparelho.': [
    'Signature belongs to another device.',
    '签名属于另一台设备。',
  ],
  'Atualize a página: horário da chamada divergente.': [
    'Refresh the page: call time does not match.',
    '请刷新页面：通话时间不匹配。',
  ],
  'Audiência de grupo repetida ou fora de ordem.': [
    'Group audience duplicated or out of order.',
    '群组受众重复或顺序错误。',
  ],
  'Audiência mudou ou já foi finalizada.': [
    'Audience changed or was already finalized.',
    '受众已更改或已确定。',
  ],
  'Autoridade antiga no cofre.': [
    'Old authority in the vault.',
    '保险库中的授权已过时。',
  ],
  'Autoridade da limpeza mudou.': [
    'Cleanup authority changed.',
    '清理授权已更改。',
  ],
  'Autorização do aparelho mudou. Confira novamente.': [
    'Device authorization changed. Check again.',
    '设备授权已更改。请重新核对。',
  ],
  'Autorização exige HTTPS.': [
    'Authorization requires HTTPS.',
    '授权需要 HTTPS。',
  ],
  'Autorização não registrada.': [
    'Authorization not registered.',
    '授权未登记。',
  ],
  'Autorização pertence a outro aparelho.': [
    'Authorization belongs to another device.',
    '授权属于另一台设备。',
  ],
  'Badge deve ocupar uma linha sem controles invisíveis.': [
    'The badge must be one line without invisible control characters.',
    '徽章必须为一行，且不含不可见控制字符。',
  ],
  'Badge inválido ou muito longo.': [
    'Badge invalid or too long.',
    '徽章无效或过长。',
  ],
  'Badge mudou. Recarregue.': [
    'Badge changed. Reload.',
    '徽章已更改。请刷新。',
  ],
  'Banner alterado em outro aparelho. Recarregue antes de editar.': [
    'Banner changed on another device. Reload before editing.',
    '横幅已在另一台设备上更改。请刷新后再编辑。',
  ],
  'Bloco não confirmado nesta conta.': [
    'Block not confirmed in this account.',
    '数据块未在此账户中确认。',
  ],
  'Bloqueio de DM mudou. Recarregue.': [
    'DM block changed. Reload.',
    '私信屏蔽设置已更改。请刷新。',
  ],
  'Canal sem autorização atual.': [
    'Channel has no current authorization.',
    '通道缺少当前授权。',
  ],
  'Candidato fora do relay rejeitado.': [
    'Non-relay candidate rejected.',
    '非中继候选项被拒绝。',
  ],
  'Candidato substituído ou expirado.': [
    'Candidate replaced or expired.',
    '候选内容已被替换或过期。',
  ],
  'Capacidade do ranking insuficiente para publicar o universo completo.': [
    'Insufficient ranking capacity to publish the full set.',
    '排行榜容量不足，无法发布完整集合。',
  ],
  'Capacidade global insuficiente para publicar o ranking.': [
    'Insufficient global capacity to publish the ranking.',
    '全局容量不足，无法发布排行榜。',
  ],
  'Capacidade global ocupada pelos dados usados ou uploads em andamento. Retome depois.':
    [
      'Global capacity occupied by stored data or ongoing uploads. Resume later.',
      '已存数据或正在上传的内容占用了全局容量。请稍后继续。',
    ],
  'Cartão excede o limite da mensagem.': [
    'Card exceeds the message limit.',
    '卡片超过消息上限。',
  ],
  'Chave de outra conta ou aparelho.': [
    'Key belongs to another account or device.',
    '密钥属于另一个账户或设备。',
  ],
  'Chave de recuperação sem autoridade verificada.': [
    'Recovery key lacks verified authority.',
    '恢复密钥缺少已验证授权。',
  ],
  'Chave de sessão de DM substituída.': [
    'DM session key replaced.',
    '私信会话密钥已替换。',
  ],
  'Chave descartável repetida com conteúdo diferente.': [
    'One-time key repeated with different content.',
    '一次性密钥重复，但内容不同。',
  ],
  'Chave Matrix não canônica.': [
    'Matrix key is not canonical.',
    'Matrix 密钥格式不规范。',
  ],
  'Chaves do aparelho de DMs mudaram.': [
    'DM device keys changed.',
    '私信设备密钥已更改。',
  ],
  'Chaves do destinatário mudaram. Confira novamente.': [
    'Recipient keys changed. Check again.',
    '接收者密钥已更改。请重新核对。',
  ],
  'Chaves fora da participação autorizada.': [
    'Keys outside authorized membership.',
    '密钥不属于已授权成员范围。',
  ],
  'Chaves Matrix deste aparelho mudaram. Autorize uma nova identidade de aparelho.':
    [
      "This device's Matrix keys changed. Authorize a new device identity.",
      '此设备的 Matrix 密钥已更改。请授权新的设备身份。',
    ],
  'Chaves Matrix divergentes do vínculo.': [
    'Matrix keys differ from the binding.',
    'Matrix 密钥与绑定不一致。',
  ],
  'Ciphertext Matrix não canônico.': [
    'Matrix ciphertext is not canonical.',
    'Matrix 密文格式不规范。',
  ],
  'Código expirado ou prazo inválido. Crie um novo pedido.': [
    'Code expired or deadline invalid. Create a new request.',
    '代码已过期或期限无效。请创建新请求。',
  ],
  'Código expirado, cancelado ou já utilizado.': [
    'Code expired, cancelled or already used.',
    '代码已过期、取消或已使用。',
  ],
  'Código expirado, reutilizado ou aparelho divergente.': [
    'Code expired, reused or device does not match.',
    '代码已过期、被重复使用或设备不匹配。',
  ],
  'Código expirado. Gere outro no aparelho conectado.': [
    'Code expired. Generate another on the connected device.',
    '代码已过期。请在已连接设备上重新生成。',
  ],
  'Código já usado ou inválido.': [
    'Code already used or invalid.',
    '代码已使用或无效。',
  ],
  'Código já usado.': ['Code already used.', '代码已使用。'],
  'Código já utilizado. Crie um novo pedido.': [
    'Code already used. Create a new request.',
    '代码已使用。请创建新请求。',
  ],
  'Código pertence a outra conta.': [
    'Code belongs to another account.',
    '代码属于另一个账户。',
  ],
  'Código pertence a outra sessão.': [
    'Code belongs to another session.',
    '代码属于另一个会话。',
  ],
  'Cofre antigo, omitido ou divergente.': [
    'Vault outdated, omitted or inconsistent.',
    '保险库过时、缺失或不一致。',
  ],
  'Cofre cheio. Preserve ou exclua conteúdo antes de aceitar novos dados.': [
    'Vault full. Preserve or delete content before accepting new data.',
    '保险库已满。接受新数据前，请保留或删除内容。',
  ],
  'Cofre de grupo cheio nesta categoria.': [
    'Group vault full in this category.',
    '群组保险库的此类别已满。',
  ],
  'Cofre mudou em outro aparelho. Sincronize mantendo o rascunho.': [
    'Vault changed on another device. Sync while preserving the draft.',
    '保险库已在另一台设备上更改。请保留草稿并同步。',
  ],
  'Cofre remoto anterior ao checkpoint local.': [
    'Remote vault predates the local checkpoint.',
    '远程保险库早于本地检查点。',
  ],
  'Comunidade arquivada: disponível apenas para leitura.': [
    'Community archived: read only.',
    '社区已归档：仅可阅读。',
  ],
  'Comunidades ocupadas. Aguarde.': [
    'Communities busy. Please wait.',
    '社区服务繁忙。请稍候。',
  ],
  'Conclua ou cancele as publicações em andamento.': [
    'Complete or cancel ongoing publications.',
    '请完成或取消正在进行的发布。',
  ],
  'Conclua ou cancele as transferências em andamento.': [
    'Complete or cancel ongoing transfers.',
    '请完成或取消正在进行的传输。',
  ],
  'Configure aparelhos e recuperação antes de abrir o cofre.': [
    'Configure devices and recovery before opening the vault.',
    '请先配置设备和恢复功能，再打开保险库。',
  ],
  'Configure primeiro a recuperação em um aparelho autorizado.': [
    'Configure recovery on an authorized device first.',
    '请先在已授权设备上配置恢复功能。',
  ],
  'Confirme a criação explícita do perfil público.': [
    'Explicitly confirm public profile creation.',
    '请明确确认创建公开个人资料。',
  ],
  'Confirme a wallet nesta sessão antes de resetar o cofre.': [
    'Confirm your wallet in this session before resetting the vault.',
    '重置保险库前，请在此会话中确认钱包。',
  ],
  'Confirme a wallet nesta sessão para executar esta ação.': [
    'Confirm your wallet in this session to perform this action.',
    '请在此会话中确认钱包以执行此操作。',
  ],
  'Consulte o diretório completo.': [
    'Check the full directory.',
    '请查阅完整目录。',
  ],
  'Conta indisponível. Tente novamente.': [
    'Account unavailable. Try again.',
    '账户不可用。请重试。',
  ],
  'Conta ocupada. Aguarde.': [
    'Account busy. Please wait.',
    '账户服务繁忙。请稍候。',
  ],
  'conta-solana-ausente': ['Solana account missing', '缺少 Solana 账户'],
  'conta-solana-invalida': ['Invalid Solana account', 'Solana 账户无效'],
  'Contato indisponível para esta operação.': [
    'Contact unavailable for this operation.',
    '此操作无法使用该联系人。',
  ],
  'Contato sem consentimento atual.': [
    'Contact has no current consent.',
    '联系人缺少当前同意。',
  ],
  'Contatos mudaram durante a publicação. Confira a audiência e tente novamente.':
    [
      'Contacts changed during publication. Check the audience and try again.',
      '发布期间联系人已更改。请核对受众后重试。',
    ],
  'Contestação já enviada ou remoção encerrada.': [
    'Appeal already sent or removal ended.',
    '申诉已发送或移除流程已结束。',
  ],
  'Contestação já enviada ou sanção encerrada.': [
    'Appeal already sent or sanction ended.',
    '申诉已发送或处罚已结束。',
  ],
  'Contestação já revisada.': ['Appeal already reviewed.', '申诉已复核。'],
  'Contestação substituída, indisponível ou expirada.': [
    'Appeal superseded, unavailable or expired.',
    '申诉已被替代、不可用或过期。',
  ],
  'Conteste antes da revisão, ou restaure com motivo.': [
    'Appeal before review, or restore with a reason.',
    '请在复核前申诉，或填写原因后恢复。',
  ],
  'Conteúdo excluído ou oculto não aceita novas interações.': [
    'Deleted or hidden content does not accept new interactions.',
    '已删除或隐藏的内容不接受新的互动。',
  ],
  'Conversa exige duas contas.': [
    'A conversation requires two accounts.',
    '对话需要两个账户。',
  ],
  'Convite de outro site.': [
    'Invitation belongs to another site.',
    '邀请属于其他网站。',
  ],
  'Convite ou transferência encerrados.': [
    'Invitation or transfer ended.',
    '邀请或转让已结束。',
  ],
  'Cota de mídia do grupo cheia. Aguarde a limpeza ou exporte e limpe o cofre.':
    [
      'Group media quota full. Wait for cleanup or export and clear the vault.',
      '群组媒体额度已满。请等待清理，或导出并清理保险库。',
    ],
  'Cota de texto/controle do grupo cheia.': [
    'Group text/control quota full.',
    '群组文字与控制数据额度已满。',
  ],
  'Crie seu perfil público em Perfil antes de participar.': [
    'Create your public profile in Profile before participating.',
    '请先在“个人资料”中创建公开个人资料，再参与。',
  ],
  'Crie seu perfil público em Perfil para organizar suas listas.': [
    'Create your public profile in Profile to organize your lists.',
    '请在“个人资料”中创建公开个人资料以管理列表。',
  ],
  'Cursor no futuro.': ['Cursor is in the future.', '游标指向未来。'],
  'Cursor pertence a outra discussão ou ordenação.': [
    'Cursor belongs to another discussion or ordering.',
    '游标属于其他讨论或排序。',
  ],
  'Cursor pertence a outros filtros.': [
    'Cursor belongs to different filters.',
    '游标属于其他筛选条件。',
  ],
  'Denúncia já encerrada.': ['Report already closed.', '举报已结束。'],
  'Desafio expirado ou de outro contexto.': [
    'Challenge expired or belongs to another context.',
    '验证请求已过期或属于其他上下文。',
  ],
  'Desafio expirado. Gere outro código.': [
    'Challenge expired. Generate another code.',
    '验证请求已过期。请生成新代码。',
  ],
  'Desafio inválido ou expirado.': [
    'Challenge invalid or expired.',
    '验证请求无效或已过期。',
  ],
  'Descrição alterada em outro aparelho. Recarregue antes de editar.': [
    'Description changed on another device. Reload before editing.',
    '简介已在另一台设备上更改。请刷新后编辑。',
  ],
  'Destinatário já incluído nesta publicação.': [
    'Recipient already included in this publication.',
    '发布已包含此接收者。',
  ],
  'Destinatário repetido.': ['Duplicate recipient.', '接收者重复。'],
  'Destinatário suspenso.': ['Recipient suspended.', '接收者资格已暂停。'],
  'Digite de 2 a 100 caracteres para buscar.': [
    'Enter 2–100 characters to search.',
    '请输入 2–100 个字符以搜索。',
  ],
  'Diretório alterado em outro aparelho. Atualize e confirme novamente.': [
    'Directory changed on another device. Refresh and confirm again.',
    '目录已在另一台设备上更改。请刷新并重新确认。',
  ],
  'Diretório antigo ou incompleto.': [
    'Directory outdated or incomplete.',
    '目录已过时或不完整。',
  ],
  'Diretório de DMs contém dados de outro contexto.': [
    'DM directory contains data from another context.',
    '私信目录包含其他上下文的数据。',
  ],
  'Diretório do contato mudou.': [
    'Contact directory changed.',
    '联系人目录已更改。',
  ],
  'Diretório fora do histórico autorizado.': [
    'Directory outside authorized history.',
    '目录不属于已授权历史范围。',
  ],
  'Diretório inclui aparelho sem autorização atual.': [
    'Directory includes a device without current authorization.',
    '目录包含缺少当前授权的设备。',
  ],
  'Diretório ou recuperação de participante mudou. Atualize antes de reenviar.':
    [
      'Participant directory or recovery changed. Refresh before resending.',
      '成员目录或恢复信息已更改。重发前请刷新。',
    ],
  'Diretório pertence a outra conta.': [
    'Directory belongs to another account.',
    '目录属于另一个账户。',
  ],
  'Dispositivos alterados. Atualize antes de salvar.': [
    'Devices changed. Refresh before saving.',
    '设备已更改。请刷新后保存。',
  ],
  'DM aceita texto, fotos, GIFs e voz declarados; perfil privado e outras operações são proibidos.':
    [
      'DMs accept declared text, photos, GIFs and voice; private profiles and other operations are prohibited.',
      '私信仅接受已声明的文字、图片、GIF 和语音；禁止私密个人资料及其他操作。',
    ],
  'DM aceita: use a limpeza pessoal após preservar seu backup.': [
    'DM accepted: use personal cleanup after preserving your backup.',
    '私信已接受：请保留备份后使用个人清理。',
  ],
  'DM exige duas pessoas.': ['A DM requires two people.', '私信需要两个人。'],
  'DM exige identidade e chaves independentes.': [
    'DMs require independent identity and keys.',
    '私信需要独立身份和密钥。',
  ],
  'DM removida do cofre pessoal.': [
    'DM removed from the personal vault.',
    '私信已从个人保险库中移除。',
  ],
  'DM sem aceite atual ou indisponível.': [
    'DM has no current acceptance or is unavailable.',
    '私信缺少当前接受记录或不可用。',
  ],
  'Domínio privado não permitido.': [
    'Private domain not allowed.',
    '不允许私有域名。',
  ],
  'Download suspenso por falta de consentimento.': [
    'Download suspended due to missing consent.',
    '下载因缺少同意而暂停。',
  ],
  'Encerre uma sessão antes de abrir outra.': [
    'End one session before opening another.',
    '打开新会话前，请结束当前会话。',
  ],
  'Endereço privado IPv4 necessário.': [
    'A private IPv4 address is required.',
    '需要私有 IPv4 地址。',
  ],
  'Entrada exige navegação de documento.': [
    'Entry requires document navigation.',
    '入口需要文档导航。',
  ],
  'Entrega de DM suspensa. É necessário novo consentimento.': [
    'DM delivery suspended. Renewed consent is required.',
    '私信送达已暂停。需要重新同意。',
  ],
  'Entrega suspensa. É necessário novo consentimento.': [
    'Delivery suspended. Renewed consent is required.',
    '送达已暂停。需要重新同意。',
  ],
  'Envelope de grupo repetido divergente.': [
    'Repeated group envelope does not match.',
    '重复群组封装不匹配。',
  ],
  'Envelope de outra identidade Olm.': [
    'Envelope belongs to another Olm identity.',
    '封装属于其他 Olm 身份。',
  ],
  'Envelope de outro aparelho/contexto.': [
    'Envelope belongs to another device/context.',
    '封装属于其他设备或上下文。',
  ],
  'Envelope exige Olm.': ['Envelope requires Olm.', '封装需要 Olm。'],
  'Envelope exige um aparelho.': [
    'Envelope requires a device.',
    '封装需要设备。',
  ],
  'Envelope repetido divergente.': [
    'Repeated envelope does not match.',
    '重复封装不匹配。',
  ],
  'Envie a recuperação desta sessão antes de continuar.': [
    'Send recovery for this session before continuing.',
    '继续前请发送此会话的恢复信息。',
  ],
  'Envio aceito: use a exclusão bilateral.': [
    'Send accepted: use bilateral deletion.',
    '发送已接受：请使用双方删除功能。',
  ],
  'Envio já aceito.': ['Send already accepted.', '发送已被接受。'],
  'Época de recuperação mudou.': [
    'Recovery epoch changed.',
    '恢复周期已更改。',
  ],
  'Escolha 1, 7, 30 dias ou banimento reversível.': [
    'Choose 1, 7 or 30 days, or a reversible ban.',
    '请选择 1、7、30 天，或可撤销封禁。',
  ],
  'Escolha até {0} tags.': ['Choose up to {0} tags.', '最多选择 {0} 个标签。'],
  'Escolha outro perfil para denunciar.': [
    'Choose another profile to report.',
    '请选择其他个人资料以举报。',
  ],
  'Escrita de anexo interrompida.': [
    'Attachment write interrupted.',
    '附件写入已中断。',
  ],
  'Escrita interrompida.': ['Write interrupted.', '写入已中断。'],
  'Espaço de conteúdo do grupo cheio. A margem restante é administrativa.': [
    'Group content space full. Remaining capacity is reserved for administration.',
    '群组内容空间已满。剩余容量保留给管理数据。',
  ],
  'Esta análise não aceita contestação.': [
    'This analysis does not accept appeals.',
    '此分析不接受申诉。',
  ],
  'Esta conta exige recuperação pelo código antigo ou por aparelho autorizado.':
    [
      'This account requires recovery through the old code or an authorized device.',
      '此账户需要通过旧代码或已授权设备恢复。',
    ],
  'Esta contestação já foi decidida.': [
    'This appeal has already been decided.',
    '此申诉已作出决定。',
  ],
  'Esta mensagem atingiu 64 alterações; envie uma nova mensagem.': [
    'This message reached 64 changes; send a new message.',
    '此消息已达到 64 次更改；请发送新消息。',
  ],
  'Estado do post contém dados restritos.': [
    'Post state contains restricted data.',
    '帖子状态包含受限数据。',
  ],
  'Este @ é reservado pelo aplicativo.': [
    'This handle is reserved by the app.',
    '此用户名由应用保留。',
  ],
  'Este @ já está em uso. Escolha outro.': [
    'This handle is already in use. Choose another.',
    '此用户名已被使用。请选择其他用户名。',
  ],
  'Este badge está em uso. Remova as atribuições antes de excluir a definição.':
    [
      'This badge is in use. Remove assignments before deleting its definition.',
      '此徽章正在使用中。请先移除分配记录，再删除定义。',
    ],
  'Este pedido já recebeu um retorno.': [
    'This request already received a return.',
    '此请求已收到返回结果。',
  ],
  'Feed restrito à própria conta.': [
    'Feed restricted to your own account.',
    '动态仅限你自己的账户。',
  ],
  'Formato de DM pelo @ fora deste contexto.': [
    'Handle DM format outside this context.',
    '用户名私信格式不适用于此上下文。',
  ],
  'Foto indisponível ou expirada.': [
    'Photo unavailable or expired.',
    '图片不可用或已过期。',
  ],
  'Foto inválida ou com metadados. Prepare novamente.': [
    'Photo invalid or contains metadata. Prepare it again.',
    '图片无效或包含元数据。请重新处理。',
  ],
  'Foto não está integralmente preservada.': [
    'Photo not fully preserved.',
    '图片未完整保留。',
  ],
  'Foto substituída ou expirada.': [
    'Photo replaced or expired.',
    '图片已替换或过期。',
  ],
  'Grupo excluído ainda tem membros.': [
    'Deleted group still has members.',
    '已删除群组仍有成员。',
  ],
  'Grupo indisponível para esta conta.': [
    'Group unavailable for this account.',
    '此账户无法访问该群组。',
  ],
  'Grupo mudou. Confira novamente.': [
    'Group changed. Check again.',
    '群组已更改。请重新核对。',
  ],
  'Grupo sem autoridade de aparelho verificada.': [
    'Group lacks verified device authority.',
    '群组缺少已验证设备授权。',
  ],
  'Há quatro uploads incompletos. Retome ou descarte antes de criar outro.': [
    'Four uploads are incomplete. Resume or discard them before creating another.',
    '有四项上传未完成。创建新上传前，请恢复或丢弃现有上传。',
  ],
  'Há uma decisão ou solicitação pendente. Confira a caixa de solicitações.': [
    'A decision or request is pending. Check the requests inbox.',
    '有待处理决定或请求。请检查请求收件箱。',
  ],
  'Histórico de DMs mudou durante a leitura. Retome a sincronização.': [
    'DM history changed while reading. Resume synchronization.',
    '读取期间私信历史已更改。请恢复同步。',
  ],
  'Histórico restrito ao autor e gestores.': [
    'History restricted to the author and managers.',
    '历史仅作者与管理员可见。',
  ],
  'Identidade de aparelho já registrada.': [
    'Device identity already registered.',
    '设备身份已注册。',
  ],
  'Identidade ou aparelhos mudaram. Refaça a cifragem.': [
    'Identity or devices changed. Encrypt again.',
    '身份或设备已更改。请重新加密。',
  ],
  'Identificador de autorização já utilizado.': [
    'Authorization identifier already used.',
    '授权标识已使用。',
  ],
  'Identificador de badge já usado.': [
    'Badge identifier already used.',
    '徽章标识已使用。',
  ],
  'Identificador de criação já utilizado.': [
    'Creation identifier already used.',
    '创建标识已使用。',
  ],
  'Identificador de denúncia já usado.': [
    'Report identifier already used.',
    '举报标识已使用。',
  ],
  'Identificador de denúncia já utilizado.': [
    'Report identifier already used.',
    '举报标识已使用。',
  ],
  'Identificador de DM já utilizado.': [
    'DM identifier already used.',
    '私信标识已使用。',
  ],
  'Identificador de mensagem já utilizado.': [
    'Message identifier already used.',
    '消息标识已使用。',
  ],
  'Identificador de mídia já utilizado. Inicie outro envio.': [
    'Media identifier already used. Start another upload.',
    '媒体标识已使用。请发起新上传。',
  ],
  'Identificador de organização já utilizado.': [
    'Organization identifier already used.',
    '组织标识已使用。',
  ],
  'Identificador de post já utilizado.': [
    'Post identifier already used.',
    '帖子标识已使用。',
  ],
  'Identificador de remoção já utilizado.': [
    'Removal identifier already used.',
    '移除标识已使用。',
  ],
  'Identificador de sanção já utilizado.': [
    'Sanction identifier already used.',
    '处罚标识已使用。',
  ],
  'Identificador de tag já utilizado.': [
    'Tag identifier already used.',
    '标签标识已使用。',
  ],
  'Identificador já usado por outra operação.': [
    'Identifier already used by another operation.',
    '标识已被其他操作使用。',
  ],
  'Informe somente o domínio, sem endereço de página.': [
    'Enter only the domain, without a page address.',
    '请仅输入域名，不包含页面地址。',
  ],
  'Inscrição já vinculada; remova-a na conta anterior.': [
    'Subscription already linked; remove it from the previous account.',
    '订阅已关联；请先从原账户移除。',
  ],
  'Já existe uma comunidade com esse nome. Escolha outro.': [
    'A community with this name already exists. Choose another.',
    '已有同名社区。请选择其他名称。',
  ],
  'Já existe uma sanção ativa para este perfil.': [
    'This profile already has an active sanction.',
    '此个人资料已有有效处罚。',
  ],
  'Já existe uma tag com esse nome nesta comunidade.': [
    'This community already has a tag with this name.',
    '此社区已有同名标签。',
  ],
  'Leitura exige conteúdo recebido e preservado neste aparelho.': [
    'Read receipt requires content received and preserved on this device.',
    '已读回执需要内容已在此设备上接收并保留。',
  ],
  'Leitura exige DMs recebidas e preservadas neste aparelho.': [
    'Read receipt requires DMs received and preserved on this device.',
    '已读回执需要私信已在此设备上接收并保留。',
  ],
  'Leitura exige mensagens recebidas e preservadas neste aparelho.': [
    'Read receipt requires messages received and preserved on this device.',
    '已读回执需要消息已在此设备上接收并保留。',
  ],
  'Limite de cadastros de dispositivos atingido.': [
    'Device registration limit reached.',
    '已达到设备注册上限。',
  ],
  'Limite de criação: uma por minuto e dez por hora.': [
    'Creation limit: one per minute and ten per hour.',
    '创建上限：每分钟 1 个，每小时 10 个。',
  ],
  'Limite temporário de aparelhos conectados.': [
    'Temporary connected device limit reached.',
    '已达到已连接设备的临时上限。',
  ],
  'Limpeza do cofre em andamento.': [
    'Vault cleanup in progress.',
    '保险库清理正在进行。',
  ],
  'Link sem autoridade de aparelho verificada.': [
    'Link lacks verified device authority.',
    '链接缺少已验证设备授权。',
  ],
  'Lote duplicado.': ['Duplicate batch.', '批次重复。'],
  'Manifesto sem autorização verificada.': [
    'Manifest lacks verified authorization.',
    '清单缺少已验证授权。',
  ],
  'Marcador de post contém badges restritos.': [
    'Post marker contains restricted badges.',
    '帖子标记包含受限徽章。',
  ],
  'Marcador de post contém dados restritos.': [
    'Post marker contains restricted data.',
    '帖子标记包含受限数据。',
  ],
  'Menções demais nesta publicação.': [
    'Too many mentions in this publication.',
    '此发布中的提及过多。',
  ],
  'Mensagem apagada ou confirmação divergente.': [
    'Message deleted or confirmation does not match.',
    '消息已删除或确认不匹配。',
  ],
  'Mensagem apagada ou removida do cofre pessoal.': [
    'Message deleted or removed from the personal vault.',
    '消息已删除或从个人保险库中移除。',
  ],
  'Mensagem ausente ou divergente.': [
    'Message missing or does not match.',
    '消息缺失或不匹配。',
  ],
  'Mensagem concorrente divergente ou apagada.': [
    'Concurrent message differs or was deleted.',
    '并发消息不一致或已删除。',
  ],
  'Mensagem de DM divergente da seleção de limpeza.': [
    'DM differs from the cleanup selection.',
    '私信与清理选择不一致。',
  ],
  'Mensagem de DM indisponível no cofre pessoal.': [
    'DM unavailable in the personal vault.',
    '个人保险库中的私信不可用。',
  ],
  'Mensagem de DM já aceita.': ['DM already accepted.', '私信已被接受。'],
  'Mensagem de grupo repetida divergente.': [
    'Repeated group message does not match.',
    '重复群组消息不匹配。',
  ],
  'Mensagem de grupo sem autoridade verificada.': [
    'Group message lacks verified authority.',
    '群组消息缺少已验证授权。',
  ],
  'Mensagem de outro período de participação.': [
    'Message belongs to another membership period.',
    '消息属于其他成员有效期。',
  ],
  'Mensagem fora da participação autorizada.': [
    'Message outside authorized membership.',
    '消息不在已授权成员范围内。',
  ],
  'Mensagem já aceita ou apagada.': [
    'Message already accepted or deleted.',
    '消息已被接受或删除。',
  ],
  'Mensagem já apagada.': ['Message already deleted.', '消息已删除。'],
  'Mensagem não corresponde aos membros autorizados.': [
    'Message does not match the authorized members.',
    '消息与已授权成员不匹配。',
  ],
  'Mensagem original removida do cofre pessoal.': [
    'Original message removed from the personal vault.',
    '原始消息已从个人保险库中移除。',
  ],
  'Mensagem removida do cofre pessoal.': [
    'Message removed from the personal vault.',
    '消息已从个人保险库中移除。',
  ],
  'Mensagem repetida divergente.': [
    'Repeated message does not match.',
    '重复消息不匹配。',
  ],
  'Mensagem sem autoridade verificada.': [
    'Message lacks verified authority.',
    '消息缺少已验证授权。',
  ],
  'Mensagens ou permissões mudaram. Sincronize novamente.': [
    'Messages or permissions changed. Sync again.',
    '消息或权限已更改。请重新同步。',
  ],
  'Mensagens repetidas.': ['Duplicate messages.', '消息重复。'],
  'Mídia de DM não está integralmente preservada.': [
    'DM media not fully preserved.',
    '私信媒体未完整保留。',
  ],
  'Mídia não disponível para esta postagem.': [
    'Media unavailable for this post.',
    '此帖子无法使用该媒体。',
  ],
  'Mídia não está integralmente preservada.': [
    'Media not fully preserved.',
    '媒体未完整保留。',
  ],
  'Mídia não preparada.': ['Media not prepared.', '媒体未准备好。'],
  'Mídia ocupada.': ['Media busy.', '媒体正在使用中。'],
  'Mídia pública repetida.': ['Duplicate public media.', '公开媒体重复。'],
  'Mídia repetida.': ['Duplicate media.', '媒体重复。'],
  'Mídia sem análise vigente.': [
    'Media has no current analysis.',
    '媒体缺少当前有效分析。',
  ],
  'Mídia sem aprovação expirou. Envie outro arquivo.': [
    'Unapproved media expired. Upload another file.',
    '未获批准的媒体已过期。请上传其他文件。',
  ],
  'Mídia substituída ou expirada.': [
    'Media replaced or expired.',
    '媒体已替换或过期。',
  ],
  'Mídia vazia ou incompleta.': [
    'Media empty or incomplete.',
    '媒体为空或不完整。',
  ],
  'Mídia vinculada ou em processamento.': [
    'Media linked or being processed.',
    '媒体已关联或正在处理。',
  ],
  'Mídias declaradas e preservadas divergem.': [
    'Declared and preserved media differ.',
    '声明的媒体与已保留媒体不一致。',
  ],
  'Migração exige aparelho autorizado.': [
    'Migration requires an authorized device.',
    '迁移需要已授权设备。',
  ],
  'Mudança de participação ou propriedade não autorizada.': [
    'Membership or ownership change not authorized.',
    '成员身份或所有权更改未获授权。',
  ],
  'Muitas entradas pendentes. Aguarde.': [
    'Too many pending sign-ins. Please wait.',
    '待处理登录过多。请稍候。',
  ],
  'Muitos pedidos de login. Aguarde.': [
    'Too many sign-in requests. Please wait.',
    '登录请求过多。请稍候。',
  ],
  'Muitos pedidos de retorno. Aguarde.': [
    'Too many return requests. Please wait.',
    '返回请求过多。请稍候。',
  ],
  'Muitos pedidos de vinculação. Aguarde.': [
    'Too many linking requests. Please wait.',
    '关联请求过多。请稍候。',
  ],
  'Muitos pedidos. Aguarde.': [
    'Too many requests. Please wait.',
    '请求过多。请稍候。',
  ],
  'Muitos retornos de recuperação. Aguarde.': [
    'Too many recovery returns. Please wait.',
    '恢复返回结果过多。请稍候。',
  ],
  'Mute mudou em outro aparelho; atualize.': [
    'Mute setting changed on another device; refresh.',
    '静音设置已在其他设备上更改；请刷新。',
  ],
  'Não é possível bloquear a própria wallet.': [
    'You cannot block your own wallet.',
    '不能屏蔽自己的钱包。',
  ],
  'Não foi possível confirmar o DNS agora.': [
    'Could not confirm DNS now.',
    '暂时无法确认 DNS。',
  ],
  'Não foi possível preparar a mídia dentro dos limites. Confira o arquivo.': [
    'Could not prepare media within the limits. Check the file.',
    '无法在限制内处理媒体。请检查文件。',
  ],
  'Nome deve ocupar uma linha.': [
    'The name must be one line.',
    '名称必须为一行。',
  ],
  'Notificações indisponíveis para este perfil.': [
    'Notifications unavailable for this profile.',
    '此个人资料无法使用通知。',
  ],
  'O compartilhamento mudou. Recarregue.': [
    'The share changed. Reload.',
    '分享已更改。请刷新。',
  ],
  'O dono segue sua comunidade automaticamente.': [
    'The owner automatically follows their community.',
    '所有者会自动关注自己的社区。',
  ],
  'O perfil existente precisa ser preservado e cifrado com a nova chave.': [
    'The existing profile must be preserved and encrypted with the new key.',
    '必须保留现有个人资料，并使用新密钥加密。',
  ],
  'O post mudou. Recarregue antes de continuar.': [
    'The post changed. Reload before continuing.',
    '帖子已更改。请刷新后继续。',
  ],
  'O proprietário não precisa de função de moderador.': [
    'The owner does not need a moderator role.',
    '所有者不需要管理员角色。',
  ],
  'O sininho mudou. Recarregue.': [
    'The notification bell changed. Reload.',
    '通知设置已更改。请刷新。',
  ],
  'Operação assinada por outro aparelho.': [
    'Operation signed by another device.',
    '操作由其他设备签署。',
  ],
  'Operação de análise desconhecida.': [
    'Unknown analysis operation.',
    '未知分析操作。',
  ],
  'Operação de cofre não encontrada.': [
    'Vault operation not found.',
    '未找到保险库操作。',
  ],
  'Operação de contato não encontrada.': [
    'Contact operation not found.',
    '未找到联系人操作。',
  ],
  'Operação de dispositivos não encontrada.': [
    'Device operation not found.',
    '未找到设备操作。',
  ],
  'Operação de perfil público não encontrada.': [
    'Public profile operation not found.',
    '未找到公开个人资料操作。',
  ],
  'Operação não encontrada.': ['Operation not found.', '未找到操作。'],
  'Página de audiência repetida divergente.': [
    'Repeated audience page does not match.',
    '重复受众页面不匹配。',
  ],
  'Página muito grande.': ['Page too large.', '页面过大。'],
  'Parte de anexo adulterada ou incompleta.': [
    'Attachment part tampered with or incomplete.',
    '附件分片遭到篡改或不完整。',
  ],
  'Parte de mídia inexistente.': [
    'Media part does not exist.',
    '媒体分片不存在。',
  ],
  'Parte inexistente.': ['Part does not exist.', '分片不存在。'],
  'Participação de um grupo mudou. Atualize.': [
    "A group's membership changed. Refresh.",
    '某群组的成员身份已更改。请刷新。',
  ],
  'Participação do grupo mudou.': [
    'Group membership changed.',
    '群组成员身份已更改。',
  ],
  'Participação do grupo mudou. Atualize antes de continuar.': [
    'Group membership changed. Refresh before continuing.',
    '群组成员身份已更改。请刷新后继续。',
  ],
  'Participação mudou antes da aceitação. Atualize e cifre novamente.': [
    'Membership changed before acceptance. Refresh and encrypt again.',
    '接受前成员身份已更改。请刷新并重新加密。',
  ],
  'Participação mudou durante o upload. Cancele e cifre novamente.': [
    'Membership changed during upload. Cancel and encrypt again.',
    '上传期间成员身份已更改。请取消并重新加密。',
  ],
  'Participação repetida ou inconsistente.': [
    'Membership duplicated or inconsistent.',
    '成员身份重复或不一致。',
  ],
  'Participante suspenso.': ['Participant suspended.', '成员资格已暂停。'],
  'Participantes repetidos.': ['Duplicate participants.', '成员重复。'],
  'Pedido de chamada repetido.': ['Duplicate call request.', '通话请求重复。'],
  'Pedido de preparação excede o orçamento.': [
    'Preparation request exceeds the budget.',
    '处理请求超过预算。',
  ],
  'Pedido de retorno inválido ou expirado.': [
    'Return request invalid or expired.',
    '返回请求无效或已过期。',
  ],
  'Pedido exige confirmação no navegador original.': [
    'Request requires confirmation in the original browser.',
    '请求需要在原浏览器中确认。',
  ],
  'Pedido expirou.': ['Request expired.', '请求已过期。'],
  'Pedido já usado ou expirado.': [
    'Request already used or expired.',
    '请求已使用或过期。',
  ],
  'Pedido não autorizado.': ['Request not authorized.', '请求未获授权。'],
  'Pedido pertence a outra conta ou prazo.': [
    'Request belongs to another account or deadline.',
    '请求属于其他账户或期限。',
  ],
  'Pedido pertence a outro aparelho ou conta.': [
    'Request belongs to another device or account.',
    '请求属于其他设备或账户。',
  ],
  'Perfil alterado em outra aba. Atualize antes de continuar.': [
    'Profile changed in another tab. Refresh before continuing.',
    '个人资料已在其他标签页更改。请刷新后继续。',
  ],
  'Perfil alterado em outra sessão ou sessão expirada. Recarregue.': [
    'Profile changed in another session or session expired. Reload.',
    '个人资料已在其他会话中更改，或会话已过期。请刷新。',
  ],
  'Perfil alterado em outro aparelho. Recarregue antes de editar.': [
    'Profile changed on another device. Reload before editing.',
    '个人资料已在其他设备上更改。请刷新后编辑。',
  ],
  'Perfil mudou; recarregue suas preferências.': [
    'Profile changed; reload your preferences.',
    '个人资料已更改；请重新加载设置。',
  ],
  'Perfil não corresponde à alteração assinada.': [
    'Profile does not match the signed change.',
    '个人资料与已签名的更改不一致。',
  ],
  'Perfis públicos ocupados. Aguarde.': [
    'Public profiles busy. Please wait.',
    '公开个人资料服务繁忙。请稍候。',
  ],
  'Permissões mudaram em outro aparelho. Atualize e confira antes de repetir.':
    [
      'Permissions changed on another device. Refresh and check before retrying.',
      '权限已在其他设备上更改。请刷新并核对后重试。',
    ],
  'Post excluído ou oculto não pode ser editado.': [
    'Deleted or hidden posts cannot be edited.',
    '已删除或隐藏的帖子无法编辑。',
  ],
  'Post excluído ou remoção já encerrada.': [
    'Post deleted or removal already ended.',
    '帖子已删除或移除流程已结束。',
  ],
  'Post já excluído ou oculto.': [
    'Post already deleted or hidden.',
    '帖子已删除或隐藏。',
  ],
  'Post não admite pai.': [
    'Posts do not accept a parent.',
    '帖子不接受父内容。',
  ],
  'Postagem excluída ou oculta não aceita novas interações.': [
    'Deleted or hidden posts do not accept new interactions.',
    '已删除或隐藏的帖子不接受新的互动。',
  ],
  'Postagem indisponível para compartilhar.': [
    'Post unavailable for sharing.',
    '帖子无法分享。',
  ],
  'Postagem indisponível para este perfil.': [
    'Post unavailable for this profile.',
    '此个人资料无法访问该帖子。',
  ],
  'Preferência mudou em outro aparelho; atualize.': [
    'Preference changed on another device; refresh.',
    '设置已在其他设备上更改；请刷新。',
  ],
  'Preferência mudou. Recarregue antes de continuar.': [
    'Preference changed. Reload before continuing.',
    '设置已更改。请刷新后继续。',
  ],
  'Preparação interrompida.': ['Preparation interrupted.', '处理已中断。'],
  'Preparação ocupada. Retome depois.': [
    'Preparation busy. Resume later.',
    '处理服务繁忙。请稍后继续。',
  ],
  'Prepare a foto para remover seus metadados.': [
    'Prepare the photo to remove its metadata.',
    '请处理图片以移除元数据。',
  ],
  'Prepare uma foto PNG ou JPEG.': [
    'Prepare a PNG or JPEG photo.',
    '请处理 PNG 或 JPEG 图片。',
  ],
  'Preservação recuperável não preparada para a época atual.': [
    'Recoverable preservation not prepared for the current epoch.',
    '当前周期尚未准备可恢复保留信息。',
  ],
  'Processador de mídia não configurado.': [
    'Media processor not configured.',
    '媒体处理器未配置。',
  ],
  'Processador indisponível ou interrompido. Retome o envio.': [
    'Processor unavailable or interrupted. Resume the upload.',
    '处理器不可用或已中断。请恢复上传。',
  ],
  'Publicação diverge da audiência ou do conteúdo preparado.': [
    'Publication differs from the audience or prepared content.',
    '发布与受众或已处理内容不一致。',
  ],
  'Publicação ou aparelho mudou.': [
    'Publication or device changed.',
    '发布或设备已更改。',
  ],
  'Push ainda não configurado neste ambiente.': [
    'Push is not configured in this environment yet.',
    '此环境尚未配置推送。',
  ],
  'Ranking atualizado; recarregue a lista.': [
    'Ranking updated; reload the list.',
    '排行榜已更新；请重新加载列表。',
  ],
  'Ranking em preparação. Tente novamente.': [
    'Ranking being prepared. Try again.',
    '排行榜正在准备中。请重试。',
  ],
  'Ranking usa 24 horas ou sete dias.': [
    'Ranking uses 24 hours or seven days.',
    '排行榜使用 24 小时或七天时段。',
  ],
  'Recebimentos duplicados.': ['Duplicate receipts.', '接收凭据重复。'],
  'Recibo de DM de outro remetente ou conteúdo.': [
    'DM receipt belongs to another sender or content.',
    '私信回执属于其他发送者或内容。',
  ],
  'Recuperação de DM desatualizada.': [
    'DM recovery outdated.',
    '私信恢复信息已过时。',
  ],
  'Recuperação de outra identidade.': [
    'Recovery belongs to another identity.',
    '恢复信息属于其他身份。',
  ],
  'Recuperação de outro período de participação.': [
    'Recovery belongs to another membership period.',
    '恢复信息属于其他成员有效期。',
  ],
  'Recuperação do autor e audiência ainda não preservadas.': [
    'Author and audience recovery not yet preserved.',
    '作者和受众的恢复信息尚未保留。',
  ],
  'Recuperação exige um novo aparelho, sem reutilizar identidade revogada.': [
    'Recovery requires a new device without reusing a revoked identity.',
    '恢复需要新设备，不能重复使用已撤销的身份。',
  ],
  'Recuperação histórica restrita ao dono.': [
    'Historical recovery restricted to the owner.',
    '历史恢复仅限所有者。',
  ],
  'Recuperação não corresponde à audiência.': [
    'Recovery does not match the audience.',
    '恢复信息与受众不匹配。',
  ],
  'Referência fora de mensagem de anexo.': [
    'Reference is not for an attachment message.',
    '引用不属于附件消息。',
  ],
  'Referência repetida.': ['Duplicate reference.', '引用重复。'],
  'Referências da transferência de DM mudaram.': [
    'DM transfer references changed.',
    '私信传输引用已更改。',
  ],
  'Remetente de outra conta ou aparelho.': [
    'Sender belongs to another account or device.',
    '发送者属于其他账户或设备。',
  ],
  'Remova a função de gestão antes de aplicar uma sanção.': [
    'Remove the management role before applying a sanction.',
    '处罚前请先解除管理职务。',
  ],
  'Remova a sanção antes de nomear moderador.': [
    'Lift the sanction before appointing a moderator.',
    '任命管理员前请先撤销处罚。',
  ],
  'Reserve esta operação antes do upload.': [
    'Reserve this operation before uploading.',
    '上传前请为此操作创建预留。',
  ],
  'Resposta exige pai.': ['Replies require a parent.', '回复需要父内容。'],
  'Resposta não admite título/tag.': [
    'Replies do not accept a title/tag.',
    '回复不接受标题或标签。',
  ],
  'Resultado de análise pertence a outro conteúdo ou modelo.': [
    'Analysis result belongs to another content item or model.',
    '分析结果属于其他内容或模型。',
  ],
  'Retome a próxima parte do upload.': [
    'Resume the next upload part.',
    '请继续上传下一分片。',
  ],
  'Retorno expirado, cancelado ou divergente. Inicie novamente.': [
    'Return expired, cancelled or does not match. Start again.',
    '返回结果已过期、取消或不匹配。请重新开始。',
  ],
  'Retorno inválido ou ainda não assinado.': [
    'Return invalid or not yet signed.',
    '返回结果无效或尚未签名。',
  ],
  'Retorno já enviado.': ['Return already sent.', '返回结果已发送。'],
  'Retorno pertence a outro navegador.': [
    'Return belongs to another browser.',
    '返回结果属于其他浏览器。',
  ],
  'Revise uma contestação ou retire a sanção.': [
    'Review an appeal or lift the sanction.',
    '请复核申诉或撤销处罚。',
  ],
  'Revogação assinada por outro aparelho.': [
    'Revocation signed by another device.',
    '撤销由其他设备签署。',
  ],
  'Sanção já encerrada.': ['Sanction already ended.', '处罚已结束。'],
  'Seleção de limpeza repetida ou fora de ordem.': [
    'Cleanup selection duplicated or out of order.',
    '清理选择重复或顺序错误。',
  ],
  'Serviço em encerramento.': ['Service shutting down.', '服务正在关闭。'],
  'Serviço push não suportado.': [
    'Push service not supported.',
    '不支持此推送服务。',
  ],
  'Sessão encerrada ou expirada.': [
    'Session ended or expired.',
    '会话已结束或过期。',
  ],
  'Sessão ou autorização de cofre alterada. Atualize aparelhos.': [
    'Session or vault authorization changed. Refresh devices.',
    '会话或保险库授权已更改。请刷新设备。',
  ],
  'Seu @ já foi criado e é fixo.': [
    'Your handle has already been created and is fixed.',
    '你的用户名已创建，无法更改。',
  ],
  'Seu voto mudou. Recarregue antes de continuar.': [
    'Your vote changed. Reload before continuing.',
    '你的投票已更改。请刷新后继续。',
  ],
  'Siga a conta antes de ativar o sininho.': [
    'Follow the account before enabling its notification bell.',
    '请先关注账户，再启用其通知。',
  ],
  'Silêncio do grupo mudou em outro aparelho. Atualize.': [
    'Group mute changed on another device. Refresh.',
    '群组静音设置已在其他设备上更改。请刷新。',
  ],
  'Solicitação mudou. Recarregue.': [
    'Request changed. Reload.',
    '请求已更改。请刷新。',
  ],
  'Solicitação recusada. O destinatário pode iniciar um novo pedido.': [
    'Request declined. The recipient may start a new request.',
    '请求已拒绝。接收者可以发起新请求。',
  ],
  'Somente áudio WebRTC é permitido.': [
    'Only WebRTC audio is allowed.',
    '仅允许 WebRTC 音频。',
  ],
  'Somente o autor pode contestar esta remoção.': [
    'Only the author can appeal this removal.',
    '仅作者可以对移除决定申诉。',
  ],
  'Somente o autor pode editar o post.': [
    'Only the author can edit the post.',
    '仅作者可以编辑帖子。',
  ],
  'Somente o autor pode editar texto.': [
    'Only the author can edit text.',
    '仅作者可以编辑文字。',
  ],
  'Somente o autor pode excluir o post.': [
    'Only the author can delete the post.',
    '仅作者可以删除帖子。',
  ],
  'Somente o destinatário decide a solicitação.': [
    'Only the recipient decides on the request.',
    '仅接收者可以决定是否接受请求。',
  ],
  'Somente o dono limpa o cofre compartilhado.': [
    'Only the owner can clear the shared vault.',
    '仅所有者可以清理共享保险库。',
  ],
  'Somente o perfil afetado pode contestar.': [
    'Only the affected profile can appeal.',
    '仅受影响的个人资料可以申诉。',
  ],
  'Status indisponível ou expirado.': [
    'Status unavailable or expired.',
    '状态不可用或已过期。',
  ],
  'Status sem autoridade de origem.': [
    'Status lacks source authority.',
    '状态缺少来源授权。',
  ],
  'Tag deve ocupar uma linha.': [
    'The tag must be one line.',
    '标签必须为一行。',
  ],
  'Tag exige comunidade.': ['Tags require a community.', '标签需要关联社区。'],
  'Tag indisponível nesta comunidade.': [
    'Tag unavailable in this community.',
    '此社区无法使用该标签。',
  ],
  'Tag repetida no post.': ['Duplicate tag in the post.', '帖子中的标签重复。'],
  'Tags demais no post.': ['Too many tags in the post.', '帖子中的标签过多。'],
  'Texto com menções muito longo.': [
    'Text with mentions is too long.',
    '含提及的文字过长。',
  ],
  'Texto da comunidade inválido ou muito longo.': [
    'Community text invalid or too long.',
    '社区文字无效或过长。',
  ],
  'Texto ou quantidade de menções acima do limite.': [
    'Text or mention count exceeds the limit.',
    '文字或提及数量超过限制。',
  ],
  timeout: ['Timed out', '已超时'],
  'Título deve ocupar uma linha.': [
    'The title must be one line.',
    '标题必须为一行。',
  ],
  'Transferência de DM interrompida.': [
    'DM transfer interrupted.',
    '私信传输已中断。',
  ],
  'Transferência de DM ocupada.': ['DM transfer busy.', '私信传输繁忙。'],
  'Transferência não destinada a este perfil ou já encerrada.': [
    'Transfer is not for this profile or has already ended.',
    '转让不属于此个人资料或已结束。',
  ],
  'Transferência suspensa por falta de consentimento.': [
    'Transfer suspended due to missing consent.',
    '传输因缺少同意而暂停。',
  ],
  'Transferências em andamento. Conclua ou cancele antes de iniciar outras.': [
    'Transfers in progress. Complete or cancel them before starting more.',
    '传输正在进行。请完成或取消现有传输后再开始新的传输。',
  ],
  'Transferências em andamento. Retome ou cancele antes de iniciar outras.': [
    'Transfers in progress. Resume or cancel them before starting more.',
    '传输正在进行。请恢复或取消现有传输后再开始新的传输。',
  ],
  'Transferências ocupadas. Retome depois.': [
    'Transfers busy. Resume later.',
    '传输繁忙。请稍后继续。',
  ],
  'Transporte de DM exige contexto individual.': [
    'DM transport requires an individual context.',
    '私信传输需要一对一上下文。',
  ],
  'TURN não forneceu candidato relay.': [
    'TURN did not provide a relay candidate.',
    'TURN 未提供中继候选项。',
  ],
  'Upload em andamento ou descarte pendente.': [
    'Upload in progress or discard pending.',
    '上传正在进行或丢弃待完成。',
  ],
  'Upload em andamento. Aguarde.': [
    'Upload in progress. Please wait.',
    '正在上传。请稍候。',
  ],
  'Upload exige reserva desta conta.': [
    'Upload requires a reservation from this account.',
    '上传需要此账户的预留。',
  ],
  'Upload expirou. Inicie outro envio.': [
    'Upload expired. Start another upload.',
    '上传已过期。请发起新上传。',
  ],
  'Upload incompleto ou divergente.': [
    'Upload incomplete or does not match.',
    '上传不完整或不匹配。',
  ],
  'Upload interrompido.': ['Upload interrupted.', '上传已中断。'],
  'Upload não confirmado.': ['Upload not confirmed.', '上传未确认。'],
  'Uploads temporários ocupados. Retome depois.': [
    'Temporary uploads busy. Resume later.',
    '临时上传繁忙。请稍后继续。',
  ],
  'Use 3–30 letras sem acento, números ou _.': [
    'Use 3–30 unaccented letters, numbers or _.',
    '请使用 3–30 个不带重音符号的字母、数字或下划线。',
  ],
  'Use até 20 badges personalizados por comunidade.': [
    'Use up to 20 custom badges per community.',
    '每个社区最多使用 20 个自定义徽章。',
  ],
  'Use até 4 fotos, 3 GIFs ou 1 vídeo.': [
    'Use up to 4 photos, 3 GIFs or 1 video.',
    '最多使用 4 张图片、3 个 GIF 或 1 个视频。',
  ],
  'Use até três badges personalizados por pessoa nesta comunidade.': [
    'Use up to three custom badges per person in this community.',
    '此社区中每人最多使用三个自定义徽章。',
  ],
  'Use foto, GIF ou voz nesta DM.': [
    'Use photos, GIFs or voice in this DM.',
    '此私信请使用图片、GIF 或语音。',
  ],
  'Use fotos, GIFs ou um vídeo, sem mistura.': [
    'Use photos, GIFs or one video, without mixing.',
    '请使用图片、GIF 或一个视频，不要混合使用。',
  ],
  'Use JSON.': ['Use JSON.', '请使用 JSON。'],
  'Use um arquivo GIF.': ['Use a GIF file.', '请使用 GIF 文件。'],
  'Use um novo cadastro de aparelho para vincular.': [
    'Use a new device registration for linking.',
    '请使用新的设备注册信息进行关联。',
  ],
  'Use um único vídeo ou imagem.': [
    'Use a single video or image.',
    '请使用单个视频或图片。',
  ],
  'Use uma foto preparada PNG, JPEG ou WebP de até 2.048 px.': [
    'Use a prepared PNG, JPEG or WebP photo up to 2,048 px.',
    '请使用已处理的 PNG、JPEG 或 WebP 图片，最大 2,048 像素。',
  ],
  'Use vídeo MP4, MOV ou WebM.': [
    'Use MP4, MOV or WebM video.',
    '请使用 MP4、MOV 或 WebM 视频。',
  ],
  'Verificação de domínio ocupada. Tente novamente.': [
    'Domain verification busy. Try again.',
    '域名验证繁忙。请重试。',
  ],
  'Versão confirmada ou upload em andamento não pode ser descartado.': [
    'Confirmed versions or ongoing uploads cannot be discarded.',
    '已确认版本或正在进行的上传无法丢弃。',
  ],
  'Versão do cofre ausente ou divergente.': [
    'Vault version missing or does not match.',
    '保险库版本缺失或不匹配。',
  ],
  'Versão removida do cofre pessoal.': [
    'Version removed from the personal vault.',
    '版本已从个人保险库中移除。',
  ],
  'Versões repetidas.': ['Duplicate versions.', '版本重复。'],
  'Vinculação sem confirmação atual da wallet.': [
    'Linking lacks current wallet confirmation.',
    '关联缺少当前钱包确认。',
  ],
  'Vínculo de domínio mudou.': ['Domain binding changed.', '域名绑定已更改。'],
  'Vínculo de outro aparelho.': [
    'Binding belongs to another device.',
    '绑定属于其他设备。',
  ],
  'Vínculo Matrix de outra DM.': [
    'Matrix binding belongs to another DM.',
    'Matrix 绑定属于另一条私信。',
  ],
  'Vínculo Matrix sem autoridade verificada.': [
    'Matrix binding lacks verified authority.',
    'Matrix 绑定缺少已验证授权。',
  ],
  'Você está suspenso nesta comunidade. Consulte o motivo e a contestação.': [
    'You are suspended in this community. Check the reason and appeal.',
    '你在此社区中的资格已暂停。请查看原因并申诉。',
  ],
  'Você já é o proprietário.': ['You are already the owner.', '你已是所有者。'],
  'Você já está no seu próprio perfil.': [
    'You are already on your own profile.',
    '你已在自己的个人资料页面。',
  ],
  'Você já tem uma denúncia aberta nesta comunidade. Acompanhe sua análise.': [
    'You already have an open report in this community. Track its review.',
    '你在此社区已有正在处理的举报。请查看审核进度。',
  ],
  'Você não tem permissão para esta gestão.': [
    'You do not have permission to manage this.',
    '你没有此管理权限。',
  ],
  'Wallet inválida. Confira o endereço completo EVM ou Solana.': [
    'Invalid wallet. Check the full EVM or Solana address.',
    '钱包无效。请核对完整 EVM 或 Solana 地址。',
  ],
  publicou: ['posted', '发布了'],
  respondeu: ['replied', '回复了'],
  enviada: ['sent', '已发送'],
  recebida: ['received', '已收到'],
  seguidor: ['follower', '位关注者'],
  seguidores: ['followers', '位关注者'],
  resposta: ['reply', '回复'],
  respostas: ['replies', '回复'],
  configurando: ['setting up', '设置'],
  recuperando: ['recovering', '恢复'],
  'Conversa favorita': ['Favorite conversation', '收藏对话'],
  'Preferências da conversa': ['Conversation preferences', '对话设置'],
  'Privacidade dos próximos status': [
    'Privacy for future statuses',
    '后续状态的隐私设置',
  ],
  'Recuperação das DMs pelo @': ['Handle DM recovery', '用户名私信恢复信息'],
  'Identidade para mensagens': ['Messaging identity', '消息身份'],
  'Chamadas perdidas': ['Missed calls', '未接来电'],
  'Language preferences are still syncing.': [
    'Language preferences are still syncing.',
    '语言设置仍在同步中。',
  ],
  'Too many language preference versions.': [
    'Too many language preference versions.',
    '语言设置版本过多。',
  ],
  'Mais discutidos': ['Most discussed', '最多讨论'],
  'Mais antigos': ['Oldest', '最早'],
  'Nova publicação com mídia.': ['New media publication.', '新的媒体发布。'],
  'Sem autorização.': ['Not authorized.', '未获授权。'],
  'Diretório de dispositivos inválido.': [
    'Invalid device directory.',
    '设备目录无效。',
  ],
  'Assinatura de dispositivo inválida.': [
    'Invalid device signature.',
    '设备签名无效。',
  ],
  'Um identificador revogado não pode ser reativado.': [
    'A revoked identifier cannot be reactivated.',
    '已撤销的标识无法重新启用。',
  ],
  'Migração de recuperação inválida.': [
    'Invalid recovery migration.',
    '恢复迁移无效。',
  ],
  'Recuperação pertence a outra conta.': [
    'Recovery belongs to another account.',
    '恢复信息属于其他账户。',
  ],
  'Diretório excede o orçamento de metadados.': [
    'Directory exceeds the metadata budget.',
    '目录超过元数据预算。',
  ],
  'Conflito ou versão antiga do diretório.': [
    'Directory conflict or outdated version.',
    '目录冲突或版本过时。',
  ],
  'Aparelho sem autorização ou revogado.': [
    'Device unauthorized or revoked.',
    '设备未获授权或授权已撤销。',
  ],
  'Chaves de aparelho alteradas.': ['Device keys changed.', '设备密钥已更改。'],
  'Nudez artística em pinturas é permitida. Atos sexuais explícitos são proibidos, inclusive pintados, desenhados ou gerados por IA. Fora da exceção para pinturas, genitais e seios femininos expostos são proibidos. Biquíni e roupa curta são permitidos. Regras locais não podem relaxar essa política.':
    [
      'Artistic nudity in paintings is allowed. Explicit sexual acts are prohibited, including painted, drawn or AI-generated depictions. Outside the exception for paintings, exposed genitals and female breasts are prohibited. Bikinis and short clothing are allowed. Local rules cannot relax this policy.',
      '绘画中的艺术性裸体允许。露骨的性行为内容一律禁止，包括绘画、手绘或人工智能生成的内容。除绘画的例外外，禁止展示外露的生殖器和女性乳房。比基尼和短款服装允许。本地规则不得放宽该政策。',
    ],
  Teste: ['Test', '测试'],
  Privados: ['Private', '私密'],
  Todos: ['All', '全部'],
  Grupos: ['Groups', '群组'],
  Favoritos: ['Favorites', '收藏'],
  'Fav.': ['Fav.', '收藏'],
  Arquivadas: ['Archived', '已归档'],
  'Conversa ao lado': ['Conversation alongside', '旁边显示对话'],
  Copiar: ['Copy', '复制'],
  Minhas: ['Mine', '我的'],
  CONVERSAS: ['CONVERSATIONS', '对话'],
  CONTA: ['ACCOUNT', '账户'],
  'Atualizar agora': ['Update now', '立即更新'],
  'Pesquisar chats, contatos e mensagens': [
    'Search chats, contacts and messages',
    '搜索聊天、联系人和消息',
  ],
  'Adicionar contato ou criar grupo': [
    'Add contact or create group',
    '添加联系人或创建群组',
  ],
  'Status dos contatos': ['Contact statuses', '联系人动态'],
  'Filtrar conversas': ['Filter conversations', '筛选对话'],
  'Comunidades ao lado': ['Communities alongside', '旁边显示社区'],
  'Escolha a comunidade onde postar': [
    'Choose a community to post in',
    '选择要发布的社区',
  ],
  '0xDMme / TESTE': ['0xDMme / TEST', '0xDMme / 测试'],
  'Cancelar prova': ['Cancel test', '取消测试'],
  'Voltar ao 0xDMme': ['Return to 0xDMme', '返回 0xDMme'],
  'Conferindo destino e validade…': [
    'Checking destination and validity…',
    '正在检查目标和有效性…',
  ],
  'Conferir e autorizar': ['Check and authorize', '检查并授权'],
  'Iniciando o cliente…': ['Starting client…', '正在启动客户端…'],
  'Mensagens recebidas': ['Received messages', '收到的消息'],
  'Ver os pacotes recebidos pelo servidor': [
    'View packets received by the server',
    '查看服务器收到的数据包',
  ],
  'Para usar abas separadas:': ['To use separate tabs:', '使用不同的标签页：'],
  'Outros ensaios:': ['Other tests:', '其他测试：'],
  'Cliente Alice': ['Alice client', 'Alice 客户端'],
  'Cliente Bob': ['Bob client', 'Bob 客户端'],
  'Criar cofre cifrado': ['Create encrypted vault', '创建加密保险库'],
  'Envelope cifrado': ['Encrypted envelope', '加密封装'],
  'Criar ensaio — assinar duas vezes': [
    'Create test — sign twice',
    '创建测试：签名两次',
  ],
  'Baixar pacote cifrado': ['Download encrypted package', '下载加密包'],
  'Apagar somente o ensaio': ['Delete test only', '仅删除测试'],
  'Testar este pacote': ['Test this package', '测试此包'],
  'Hash-Talk · ensaio ZK': ['0xDMme · ZK test', '0xDMme · ZK 测试'],
  'Prova ZK isolada': ['Isolated ZK proof', '独立 ZK 证明'],
  'Gerar e verificar prova ZK': [
    'Generate and verify ZK proof',
    '生成并验证 ZK 证明',
  ],
  Clara: ['Light', '浅色'],
  e: ['and', '与'],
  'D1 · entrada={0} · chegada={1} · navegacao={2} · historico={3} · etapa={4} · provider={5} · armazenamento={6} · falha={7} · protocolo=doc-3':
    [
      'D1 · input={0} · arrival={1} · navigation={2} · history={3} · stage={4} · provider={5} · storage={6} · failure={7} · protocol=doc-3',
      'D1 · 输入={0} · 到达={1} · 导航={2} · 历史={3} · 阶段={4} · 钱包提供方={5} · 存储={6} · 故障={7} · 协议=doc-3',
    ],
  'D2 · protocolo=doc-3 · plataforma={0} · {1} · ref={2}': [
    'D2 · protocol=doc-3 · platform={0} · {1} · ref={2}',
    'D2 · 协议=doc-3 · 平台={0} · {1} · ref={2}',
  ],
  'D2 · protocolo=doc-3 · plataforma={0} · destino=invalido': [
    'D2 · protocol=doc-3 · platform={0} · destination=invalid',
    'D2 · 协议=doc-3 · 平台={0} · 目标=无效',
  ],
  'destino=entrada-caminho · modo=documento · pedido=presente · rede={0}': [
    'destination=path-entry · mode=document · request=present · network={0}',
    '目标=路径入口 · 模式=文档 · 请求=存在 · 网络={0}',
  ],
  'destino={0} · modo={1} · pedido={2} · rede={3}': [
    'destination={0} · mode={1} · request={2} · network={3}',
    '目标={0} · 模式={1} · 请求={2} · 网络={3}',
  ],
  'Fontes Matrix · 0xDMme': [
    'Matrix sources · 0xDMme',
    'Matrix 源代码 · 0xDMme',
  ],
  'Fontes e licenças Matrix': [
    'Matrix source code and licenses',
    'Matrix 源代码和许可证',
  ],
  'Baixe as partes na ordem abaixo e concatene-as em um único arquivo:': [
    'Download the parts in the order below and concatenate them into one file:',
    '按以下顺序下载各部分，并合并为一个文件：',
  ],
  'Antes de reconstruir o frontend, coloque o arquivo neste diretório:': [
    'Before rebuilding the frontend, put the file in this directory:',
    '重新构建前端之前，请将文件放在此目录：',
  ],
  'O arquivo inclui a tag oficial, Cargo.lock, as 323 fontes de registry fixadas e seus avisos. As instruções completas estão no README do pacote principal de fontes.':
    [
      'The archive includes the official tag, Cargo.lock, the 323 pinned registry source packages and their notices. Full instructions are in the main source package README.',
      '存档包含官方标签、Cargo.lock、323 个已固定版本的注册表源码包及其声明。完整说明见主要源码包的 README。',
    ],
  '0xDMme — avaliação restrita': [
    '0xDMme — restricted evaluation',
    '0xDMme：受限评估',
  ],
  'AVALIAÇÃO EXPERIMENTAL RESTRITA': [
    'RESTRICTED EXPERIMENTAL EVALUATION',
    '受限实验评估',
  ],
  'Teste suas artes': ['Test your artwork', '测试你的作品'],
  'O candidato Viddexa Nano analisa a imagem na VPS e mostra suas cinco classes, usando ONNX Runtime 1.24.4 em CPU. Ele ainda não é a proteção aceita do 0xDMme.':
    [
      'The Viddexa Nano candidate analyzes the image on the VPS and shows its five classes, using ONNX Runtime 1.24.4 on CPU. It is not yet the accepted protection for 0xDMme.',
      '候选模型 Viddexa Nano 使用 CPU 上的 ONNX Runtime 1.24.4 在 VPS 分析图片，并显示其五个类别。它尚未被接受为 0xDMme 的保护机制。',
    ],
  'Nudez artística em pinturas é permitida pela política; atos sexuais explícitos continuam proibidos. A classe':
    [
      "Policy allows artistic nudity in paintings; explicit sexual acts remain prohibited. The model's",
      '政策允许绘画中的艺术裸露；露骨性行为仍被禁止。模型的',
    ],
  'do modelo não decide essa distinção.': [
    'class does not decide this distinction.',
    '类别不能决定这一区别。',
  ],
  'Imagem estática (PNG, JPEG ou WebP, até 8 MiB)': [
    'Still image (PNG, JPEG or WebP, up to 8 MiB)',
    '静态图片（PNG、JPEG 或 WebP，最大 8 MiB）',
  ],
  'Qual resultado você espera pela política?': [
    'What result do you expect under the policy?',
    '根据政策，你预期的结果是什么？',
  ],
  'Escolha sua avaliação desta imagem': [
    'Choose your assessment of this image',
    '选择你对此图片的判断',
  ],
  'Imagem, scores e sua referência ficam juntos nesta rodada temporária, somente em memória na VPS. Sua referência não influencia o modelo. Não há treinamento nem envio automático a serviços externos.':
    [
      'The image, scores and your reference remain together in this temporary round, only in VPS memory. Your reference does not influence the model. There is no training or automatic sending to external services.',
      '图片、评分和你的参考判断一起保留在本次临时评估中，仅存于 VPS 内存。你的判断不会影响模型。不会训练模型或自动发送到外部服务。',
    ],
  'Prévia local da imagem escolhida': [
    'Local preview of the selected image',
    '所选图片的本地预览',
  ],
  'Analisar na VPS': ['Analyze on the VPS', '在 VPS 分析'],
  'Rodada de calibração': ['Calibration round', '校准批次'],
  'Os casos permanecem enquanto este ambiente estiver ativo, até 24 horas. Reiniciar o processo perde a rodada. Reabra o endereço privado para recuperar os casos. Ao terminar, exporte se precisar e apague a rodada. Até 256 casos ou 512 MiB; originais preservados sem recompressão.':
    [
      'Cases remain while this environment is active, for up to 24 hours. Restarting the process loses the round. Reopen the private address to retrieve cases. When finished, export if needed and delete the round. Up to 256 cases or 512 MiB; originals preserved without recompression.',
      '案例在此环境运行期间保留，最长 24 小时。重启进程会丢失本批次。重新打开私有地址可恢复案例。完成后，按需导出并删除批次。最多 256 个案例或 512 MiB；原件保留，不重新压缩。',
    ],
  'Atualizar galeria': ['Refresh gallery', '刷新图库'],
  'Exportar imagens + resultados': [
    'Export images + results',
    '导出图片和结果',
  ],
  'Apagar esta rodada': ['Delete this round', '删除本批次'],
  'Fontes correspondentes da interface (GPL-3.0-only)': [
    'Corresponding interface source code (GPL-3.0-only)',
    '界面的对应源代码（GPL-3.0-only）',
  ],
  '0xDMme — coleta para calibração': [
    '0xDMme — calibration collection',
    '0xDMme：校准收集',
  ],
  '0xDMme · GALERIA PRIVADA': ['0xDMme · PRIVATE GALLERY', '0xDMme · 私有图库'],
  'Você marca. Eu calibro.': ['You label. I calibrate.', '你标注，我校准。'],
  'Selecione suas imagens de uma vez e marque apenas se devem passar ou ser bloqueadas. Ao terminar, conclua o envio.':
    [
      'Select your images together and mark only whether they should pass or be blocked. When finished, complete the submission.',
      '一次选择你的图片，仅标注应通过还是被屏蔽。完成后提交。',
    ],
  'Selecionar imagens': ['Select images', '选择图片'],
  'PNG, JPEG ou WebP · até 8 MiB por imagem. Você pode adicionar mais imagens depois.':
    [
      'PNG, JPEG or WebP · up to 8 MiB per image. You can add more images later.',
      'PNG、JPEG 或 WebP · 每张最大 8 MiB。之后可以继续添加图片。',
    ],
  'Abrindo sua rodada…': ['Opening your round…', '正在打开你的批次…'],
  'Selecione imagens para começar.': [
    'Select images to begin.',
    '选择图片以开始。',
  ],
  'Imagem a ser marcada': ['Image to label', '待标注图片'],
  'Remover arquivo da fila': ['Remove file from queue', '从队列移除文件'],
  'Voltar à fila': ['Return to queue', '返回队列'],
  'Concluir envio': ['Complete submission', '完成提交'],
  'Imagens salvas e correções': [
    'Saved images and corrections',
    '已保存图片与更正',
  ],
  'Originais preservados na memória deste processo local por até 24 horas, sem treinamento nem análise externa. As marcações não alimentam o detector. Imagens já salvas sobrevivem ao recarregamento da aba; a fila ainda não marcada precisa ser selecionada novamente. Mantenha o Mac ligado e sem repouso durante a calibração.':
    [
      "Originals are preserved in this local process's memory for up to 24 hours, without training or external analysis. Labels do not feed the detector. Saved images survive tab reloads; the unlabelled queue must be selected again. Keep the Mac on and awake during calibration.",
      '原件保留在此本地进程的内存中，最长 24 小时，不用于训练或外部分析。标注不会输入检测器。已保存的图片在刷新标签页后仍保留；未标注的队列需要重新选择。校准期间请让 Mac 保持开机且不进入睡眠。',
    ],
  'Fontes correspondentes desta interface (GPL-3.0-only)': [
    'Corresponding source code for this interface (GPL-3.0-only)',
    '此界面的对应源代码（GPL-3.0-only）',
  ],
  '0xDMme — revisão restrita': [
    '0xDMme — restricted review',
    '0xDMme：受限复核',
  ],
  'Revisão excepcional': ['Exceptional review', '例外复核'],
  'Candidato de imagem': ['Image candidate', '待审核图片'],
  'Verifique a mídia completa. Nudez artística em pinturas é permitida, inclusive em pinturas digitais/IA que sejam de fato pinturas. Atos sexuais explícitos continuam proibidos. Fotos e desenhos fora dessa exceção não permitem genitais/seios femininos expostos. Decida pelo comando restrito, após conferir a contestação.':
    [
      'Inspect the complete media. Artistic nudity in paintings is allowed, including digital/AI paintings that are genuinely paintings. Explicit sexual acts remain prohibited. Photos and drawings outside this exception do not allow exposed genitals or female breasts. Decide using the restricted command after reviewing the appeal.',
      '请检查完整媒体。绘画中的艺术裸露是允许的，包括确实属于绘画的数字或 AI 绘画。露骨性行为仍被禁止。不属于此例外的照片和绘图不允许暴露生殖器或女性乳房。核对申诉后，通过受限命令作出决定。',
    ],
  'A prévia encerra em até cinco minutos.': [
    'The preview closes within five minutes.',
    '预览将在五分钟内关闭。',
  ],
  'Versão da declaração assinada inválida.': [
    'Invalid signed statement version.',
    '签名声明版本无效。',
  ],
  'O documento de login na wallet está em inglês. Ele conecta ao 0xDMme o navegador que abriu este pedido. Recuse links de outras pessoas. Não movimenta fundos, não autoriza transações e não abre seu histórico cifrado. Confira o domínio e o endereço antes de assinar.':
    [
      'The wallet login document is in English. It connects the browser that opened this request to 0xDMme. Reject links from other people. It does not move funds, authorize transactions or open your encrypted history. Check the domain and address before signing.',
      '钱包中的登录文件使用英语。它会将发起此请求的浏览器连接到 0xDMme。请拒绝他人发来的链接。它不会转移资金、授权交易或打开你的加密历史记录。签名前请核对域名和地址。',
    ],
  'O documento de login na wallet está em inglês. Ele apenas conecta sua conta ao 0xDMme. Não movimenta fundos, não autoriza transações e não abre seu histórico cifrado. Confira o domínio e o endereço antes de assinar.':
    [
      'The wallet login document is in English. It only connects your account to 0xDMme. It does not move funds, authorize transactions or open your encrypted history. Check the domain and address before signing.',
      '钱包中的登录文件使用英语。它只会将你的账户连接到 0xDMme。它不会转移资金、授权交易或打开你的加密历史记录。签名前请核对域名和地址。',
    ],
  'Ver resposta': ['View reply', '查看回复'],
  grupo: ['group', '群组'],
  'Escrever resposta': ['Write a reply', '撰写回复'],
  'Resposta indisponível.': ['Reply unavailable.', '回复不可用。'],
  'Não foi possível atualizar a contagem.': [
    'Could not update the count.',
    '无法更新计数。',
  ],
  'Apagar para todos': ['Delete for everyone', '为所有人删除'],
  'Editar mensagem': ['Edit message', '编辑消息'],
  'Salvar alteração': ['Save change', '保存更改'],
  'Confira as exclusões antes de buscar.': [
    'Verify deletions before searching.',
    '搜索前请先核验删除记录。',
  ],
  'Somente seu texto conectado pode ser editado.': [
    'Only your own synced text messages can be edited.',
    '只能编辑你自己已同步的文本消息。',
  ],
  'Somente sua mensagem conectada pode ser apagada.': [
    'Only your own synced messages can be deleted.',
    '只能删除你自己已同步的消息。',
  ],
  'Confira as exclusões antes de abrir mídia.': [
    'Verify deletions before opening media.',
    '打开媒体前请先核验删除记录。',
  ],
  'Mensagem apagada ou indisponível para abrir mídia.': [
    'The message was deleted or is unavailable for opening media.',
    '消息已删除或无法用于打开媒体。',
  ],
  'Índice do grupo parcialmente conferido. Continue a sincronização.': [
    'Group index partially verified. Continue syncing.',
    '群组索引已部分核验。请继续同步。',
  ],
  'Delta de grupo divergente.': [
    'Group change set mismatch.',
    '群组变更集不匹配。',
  ],
  'Snapshot de outro grupo ou autoridade.': [
    'Snapshot belongs to another group or authorization context.',
    '快照属于其他群组或授权上下文。',
  ],
  'Índice de grupo inválido.': ['Invalid group index.', '群组索引无效。'],
  'Mensagem fora da participação atual.': [
    'Message is outside your current group participation.',
    '消息不属于你当前的群组参与范围。',
  ],
  'Índice de grupo duplicado.': ['Duplicate group index.', '群组索引重复。'],
  'Ordem de grupo divergente.': ['Group order mismatch.', '群组顺序不匹配。'],
  'Índice de grupo incompleto.': [
    'Incomplete group index.',
    '群组索引不完整。',
  ],
  'Delta de grupo excedido.': [
    'Group change set limit exceeded.',
    '群组变更集超出限制。',
  ],
  'Cursor de outra revisão.': [
    'Cursor belongs to another revision.',
    '游标属于其他修订版本。',
  ],
  'Edição divergente da mensagem original do grupo.': [
    'Edit does not match the original group message.',
    '编辑与原始群组消息不匹配。',
  ],
  'Estado antigo do grupo.': ['Outdated group state.', '群组状态已过期。'],
  'Preparação do grupo excedeu o prazo; tente novamente.': [
    'Group preparation timed out; try again.',
    '群组准备超时，请重试。',
  ],
  'Objetos de grupo incompletos.': [
    'Incomplete group objects.',
    '群组对象不完整。',
  ],
  'Objetos de outra consulta.': [
    'Objects belong to another query.',
    '对象属于其他查询。',
  ],
  'Edições de grupo inválidas.': ['Invalid group edits.', '群组编辑无效。'],
  'Exclusão divergente da mensagem de grupo já verificada.': [
    'Deletion does not match the verified group message.',
    '删除记录与已核验的群组消息不匹配。',
  ],
  'Recebimento interrompido durante suspensão.': [
    'Receiving was interrupted while suspended.',
    '暂停期间接收已中断。',
  ],
  'Alterações de outro snapshot.': [
    'Changes belong to another snapshot.',
    '变更属于其他快照。',
  ],
  'Alterações incompletas ou duplicadas.': [
    'Incomplete or duplicate changes.',
    '变更不完整或重复。',
  ],
  'Não foi possível conferir a leitura.': [
    'Could not verify read receipts.',
    '无法核验已读回执。',
  ],
  'Autoridade da exclusão mudou.': [
    'Deletion authorization has changed.',
    '删除权限已变更。',
  ],
  'Somente o autor participante pode apagar sua mensagem.': [
    'Only the author who is a group participant can delete their message.',
    '只有仍是群组成员的作者才能删除自己的消息。',
  ],
  'Mensagens do grupo mudaram. Confira novamente.': [
    'Group messages have changed. Verify them again.',
    '群组消息已变更。请重新核验。',
  ],
  'Esta mensagem atingiu 64 edições.': [
    'This message has reached 64 edits.',
    '此消息已达到 64 次编辑。',
  ],
  'Edição fora da mensagem própria autorizada.': [
    'Edit is outside your authorized message.',
    '编辑超出你自己获授权消息的范围。',
  ],
  'Índice de alterações incompleto.': [
    'Incomplete change index.',
    '变更索引不完整。',
  ],
  'Mensagens duplicadas.': ['Duplicate messages.', '消息重复。'],
  'Prova de exclusão ausente.': ['Missing deletion proof.', '缺少删除证明。'],
  'Exclusão de grupo inválida.': ['Invalid group deletion.', '群组删除无效。'],
  'Exclusão de outra mensagem, grupo ou autor.': [
    'Deletion belongs to another message, group or author.',
    '删除记录属于其他消息、群组或作者。',
  ],
  'Exclusão sem aparelho autorizado.': [
    'Deletion has no authorized device.',
    '删除操作没有获授权的设备。',
  ],
  'Ação de grupo inválida.': ['Invalid group action.', '群组操作无效。'],
  'Somente texto pode editar uma mensagem.': [
    'Only text can be used to edit a message.',
    '只能使用文本编辑消息。',
  ],
};
