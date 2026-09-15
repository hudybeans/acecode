// AskUserQuestion 提交/取消/插话后的反馈卡(设计稿样式):
//   - submit:顶部居中绿色对勾圆 + 「全部提交完成」+ 逐题 Q&A 清单(未作答灰字)
//   - cancel:顶部居中灰圆叉 + 「已取消全部回答」
//   - interject:单行灰字提示「已改为直接输入，取消作答」(TUI/IM 等通道把问题
//     以「用户改为直接输入」收掉时落盘的 interjected 标记)
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
      className="my-1 w-full overflow-hidden rounded-2xl border border-border bg-surface ace-shadow-lg"
    >
      {cancelled ? (
        <div className="py-7 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-fg-mute/20 text-fg-mute">
            <VsIcon name="close" size={22} mono={false} />
          </span>
          <h3 className="mt-3 text-[15px] font-semibold text-fg">已取消全部回答</h3>
        </div>
      ) : (
        <div>
          <div className="px-4 pb-2 pt-7 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ok text-bg">
              <VsIcon name="ok" size={22} mono={false} />
            </span>
            <h3 className="mt-3 text-[15px] font-semibold text-fg">全部提交完成</h3>
          </div>
          {summary.length > 0 && (
            <ul className="px-5 pb-5">
              {summary.map((item, index) => (
                <li key={index} className="border-t border-border py-3 first:border-t-0">
                  <div className="text-[12px] leading-snug text-fg-mute">
                    {index + 1}. {item?.question}
                    {item?.multiSelect ? '（多选）' : ''}
                  </div>
                  <div className="mt-1 text-[13px] leading-snug">
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