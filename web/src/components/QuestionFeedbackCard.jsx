// AskUserQuestion 提交/取消/插话后的反馈卡(设计稿样式):
//   - submit:左对齐绿色对勾圆 + 「全部提交完成」+ 逐题 Q&A 清单(未作答灰字)
//   - cancel:左对齐灰圆叉 + 「已取消全部回答」
//   - interject:单行灰字提示「已改为直接输入，取消作答」(TUI/IM 等通道把问题
//     以「用户改为直接输入」收掉时落盘的 interjected 标记)
// 结果态卡片无投影,与对话流气泡融合(设计稿 .ask-box:has(.ask-summary/.ask-canceled))。
import { VsIcon } from './Icon.jsx';

export function QuestionFeedbackCard({ feedback }) {
  const cancelled = feedback?.kind === 'cancel';
  const interjected = feedback?.kind === 'interject';
  const summary = cancelled || interjected ? [] : Array.isArray(feedback?.summary) ? feedback.summary : [];

  if (interjected) {
    return (
      <section
        aria-label="已改为直接输入，取消作答"
        data-question-feedback="interject"
        className="ace-qa-card my-0.5"
      >
        <div className="flex min-h-11 items-center gap-2.5 px-3 py-2 text-[12px] text-fg-mute">
          <VsIcon name="send" size={14} />
          <span>已改为直接输入，取消作答</span>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label={cancelled ? '已取消全部回答' : '全部提交完成'}
      data-question-feedback={feedback?.kind || ''}
      className="my-1 w-full overflow-hidden rounded-2xl border border-border bg-surface"
    >
      {cancelled ? (
        <div className="flex items-center gap-2.5 px-3.5 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fg-mute/20 text-fg-mute">
            <VsIcon name="close" size={15} mono={false} />
          </span>
          <h3 className="text-[15px] font-medium text-fg">已取消全部回答</h3>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2.5 border-b border-border px-3.5 pt-3 pb-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ok text-bg">
              <VsIcon name="ok" size={16} mono={false} />
            </span>
            <h3 className="text-[15px] font-medium text-fg">全部提交完成</h3>
          </div>
          {summary.length > 0 && (
            <ul className="px-4 pb-3">
              {summary.map((item, index) => (
                <li key={index} className="border-b border-border py-2 last:border-b-0">
                  <div className="text-[12px] leading-snug text-fg-mute">
                    {index + 1}. {item?.question}
                    {item?.multiSelect ? '（多选）' : ''}
                  </div>
                  <div className="mt-0.5 text-[13px] leading-snug">
                    {item?.notAnswered ? (
                      <span className="text-fg-mute">未作答</span>
                    ) : (
                      <span className="font-medium text-fg">{item?.answer}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}