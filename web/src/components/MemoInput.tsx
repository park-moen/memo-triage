import { useState, type FormEvent } from 'react';
import { MAX_CONTENT_LENGTH } from '@memo/shared';

interface Props {
  /** 저장에 성공하면 true. true일 때만 입력창을 비운다. */
  onSubmit: (content: string) => Promise<boolean>;
  disabled: boolean;
}

export function MemoInput({ onSubmit, disabled }: Props) {
  const [value, setValue] = useState('');
  const content = value.trim();
  const length = [...content].length;
  const tooLong = length > MAX_CONTENT_LENGTH;
  const canSubmit = !disabled && length > 0 && !tooLong;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    if (await onSubmit(content)) setValue('');
  }

  return (
    <form className="memo-input" onSubmit={(event) => void handleSubmit(event)}>
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="떠오른 생각을 한 줄로 적어 보세요"
        aria-label="메모"
        disabled={disabled}
      />
      <span className={tooLong ? 'counter over' : 'counter'}>
        {length}/{MAX_CONTENT_LENGTH}
      </span>
      <button type="submit" disabled={!canSubmit}>
        {disabled ? '분류 중…' : '분류'}
      </button>
    </form>
  );
}
