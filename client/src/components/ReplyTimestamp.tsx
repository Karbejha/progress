import { Clock } from 'lucide-react';
import { formatReplyTimestamp } from '../lib/replyTimestamp';

export function ReplyTimestamp({ value }: { value?: string | null }) {
  const formatted = formatReplyTimestamp(value);

  return (
    <span className="mt-1 flex flex-wrap items-center gap-1 text-[10px] font-normal text-[#5e736e]">
      <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
      {formatted ? (
        <>
          <span>وقت الرد:</span>
          <time dateTime={value!} title="بتوقيت النظام (UTC+3)">
            {formatted}
          </time>
        </>
      ) : (
        <span>وقت الرد غير مسجّل</span>
      )}
    </span>
  );
}
