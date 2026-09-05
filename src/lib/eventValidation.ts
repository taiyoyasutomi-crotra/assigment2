// イベント入力の検証。サーバー(保存前)とフォーム(入力中のリアルタイム表示)の
// 両方から使うため、DB 等に依存しない純粋なモジュールにしてある。
export type EventField =
  | "title"
  | "startsAt"
  | "venue"
  | "capacity"
  | "closesAt"
  | "endsAt"
  | "cancelDeadline";
export type EventFieldErrors = Partial<Record<EventField, string>>;

/**
 * 項目ごとの入力チェック。フォームでは該当欄の強調表示に使う。
 * title を渡さない場合(イベント設定の変更)はイベント名を検査しない
 */
export function validateEventFields(input: {
  title?: string;
  startsAt: Date;
  venue: string;
  capacity: number;
  closesAt: Date;
  endsAt: Date | null;
  cancelDeadline?: Date | null;
}): EventFieldErrors {
  const errors: EventFieldErrors = {};
  if (input.title !== undefined && !input.title.trim())
    errors.title = "イベント名を入力してください";
  if (isNaN(input.startsAt.getTime()))
    errors.startsAt = "開催日時を入力してください";
  if (!input.venue.trim()) errors.venue = "会場を入力してください";
  if (!Number.isInteger(input.capacity) || input.capacity <= 0)
    errors.capacity = "定員は1以上の整数で入力してください";
  if (isNaN(input.closesAt.getTime()))
    errors.closesAt = "申込締切日時を入力してください";
  else if (!errors.startsAt && input.closesAt >= input.startsAt)
    errors.closesAt = "申込締切はイベント開始より前にしてください";
  if (input.endsAt != null) {
    if (isNaN(input.endsAt.getTime()))
      errors.endsAt = "終了日時の形式が不正です";
    else if (!errors.startsAt && input.endsAt <= input.startsAt)
      errors.endsAt = "終了日時は開催日時より後にしてください";
  }
  if (input.cancelDeadline != null) {
    if (isNaN(input.cancelDeadline.getTime()))
      errors.cancelDeadline = "キャンセル受付期限の形式が不正です";
    else if (!errors.startsAt && input.cancelDeadline >= input.startsAt)
      errors.cancelDeadline = "キャンセル受付期限は開催日時より前にしてください";
  }
  return errors;
}
