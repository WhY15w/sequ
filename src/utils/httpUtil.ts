type InvalidAccountRes = {
  success: false;
  message: string;
  data: {
    account: string;
    error: string;
  };
  status?: number;
};

const MIN_ACCOUNT = 50000;
const MAX_ACCOUNT = 2000000000;

const isValidAccount = (account: number): boolean => {
  return !!account && account >= MIN_ACCOUNT && account <= MAX_ACCOUNT;
};

const getInvalidAccountRes = (
  account: unknown,
  includeStatus = false,
): InvalidAccountRes => {
  const res: InvalidAccountRes = {
    success: false,
    message: '数据返回失败',
    data: {
      account: String(account || ''),
      error: '请输入正确的米米号, 从50000开始，2000000000封顶',
    },
  };
  if (includeStatus) res.status = 1;
  return res;
};

const toHexStr = (buf: Buffer | null): string => {
  return buf ? buf.toString('hex').toUpperCase() : '';
};

export { isValidAccount, getInvalidAccountRes, toHexStr };
