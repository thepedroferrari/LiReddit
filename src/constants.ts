export const __prod__ = process.env.NODE_ENV === "production";
export const COOKIE_NAME = "qid";
export const FORGET_PASSWORD_PREFIX = "forget-password:";
export const EMAIL_REGEX = RegExp(`([-!#-'*+/-9=?A-Z^-~]+(\.[-!#-'*+/-9=?A-Z^-~]+)*|"([]!#-[^-~ \t]|(\\[\t -~]))+")@[0-9A-Za-z]([0-9A-Za-z-]{0,61}[0-9A-Za-z])?(\.[0-9A-Za-z]([0-9A-Za-z-]{0,61}[0-9A-Za-z])?)+`);

export enum ERROR_CODE {
  USER_EXIST = '23505'
}
