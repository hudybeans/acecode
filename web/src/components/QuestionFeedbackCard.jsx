// AskUserQuestion 提交/取消/插话后的反馈卡(设计稿样式):
//   - submit:左侧小对勾 + 「全部提交完成」+ 逐题 Q&A 清单(未作答灰字)
//   - cancel:左侧小叉 + 「已取消全部回答」

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
        <div className="flex min-h-9 items-center gap-2 px-3 py-1.5 text-[12px] text-fg-mute">
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
      className="my-1 w-full overflow-hidden rounded-lg border border-border bg-surface"
    >
      <div>
        <div className="flex items-center gap-2 px-3 py-2">
          <VsIcon name={cancelled ? 'close' : 'check'} size={14} className={cancelled ? 'shrink-0 text-fg-mute' : 'shrink-0 text-ok'} />
          <h3 className="text-[13px] leading-5 font-medium text-fg">{cancelled ? '已取消全部回答' : '全部提交完成'}</h3>
        </div>
        {summary.length > 0 && (
          <ul className="border-t border-border px-3 py-1">
            {summary.map((item, index) => (
              <li key={index} className="border-t border-border py-1.5 first:border-t-0">
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

    </section>
  );
}
