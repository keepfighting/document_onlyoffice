import { createSignal } from 'ranuts/utils';

export const [getDocmentObj, setDocmentObj] = createSignal<{
  fileName: string;
  file?: File;
  url?: string | URL;
  readonly?: boolean;
}>({
  fileName: '',
  file: undefined,
  url: undefined,
  readonly: undefined,
});
