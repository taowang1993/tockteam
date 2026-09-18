/** Pure date formatter used by the Tockbot Base evaluator. */
function pad(value: number, length = 2) {
  return String(value).padStart(length, "0");
}

function padSigned(value: number, length: number, forceSign = false) {
  const sign = value < 0 ? "-" : forceSign ? "+" : "";
  return `${sign}${String(Math.abs(value)).padStart(length, "0")}`;
}

function formatEnglishOrdinal(value: number) {
  const remainder = value % 100;
  if (remainder >= 11 && remainder <= 13) return `${value}th`;
  if (value % 10 === 1) return `${value}st`;
  if (value % 10 === 2) return `${value}nd`;
  if (value % 10 === 3) return `${value}rd`;
  return `${value}th`;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS_BEFORE_MONTH = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const MILLISECONDS_PER_DAY = 86_400_000;

function formatTimezoneOffset(date: Date, separator: string) {
  const totalMinutes = -date.getTimezoneOffset();
  const sign = totalMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(totalMinutes);
  return `${sign}${pad(Math.floor(absoluteMinutes / 60))}${separator}${pad(absoluteMinutes % 60)}`;
}

function localDayOfYear(date: Date) {
  const year = date.getFullYear();
  const leapDay = date.getMonth() > 1 && (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 1 : 0;
  return (DAYS_BEFORE_MONTH[date.getMonth()] ?? Number.NaN) + date.getDate() + leapDay;
}

function createUtcCalendarDate(year: number, month: number, day: number) {
  const calendarDate = new Date(0);
  calendarDate.setUTCHours(0, 0, 0, 0);
  calendarDate.setUTCFullYear(year, month, day);
  return calendarDate;
}

function localIsoCalendar(date: Date) {
  const calendarDate = createUtcCalendarDate(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = calendarDate.getUTCDay();
  if (!Number.isFinite(weekday)) return { week: Number.NaN, year: Number.NaN };
  calendarDate.setUTCDate(calendarDate.getUTCDate() + 4 - (weekday === 0 ? 7 : weekday));
  const year = calendarDate.getUTCFullYear();
  const isoWeekThursday = calendarDate.getTime();
  calendarDate.setUTCMonth(0, 1);
  const week = Math.ceil(((isoWeekThursday - calendarDate.getTime()) / MILLISECONDS_PER_DAY + 1) / 7);
  return { week, year };
}

function defaultEnglishWeekYearStart(year: number) {
  const firstDay = createUtcCalendarDate(year, 0, 1);
  return firstDay.getTime() - firstDay.getUTCDay() * MILLISECONDS_PER_DAY;
}

function localDefaultEnglishCalendar(date: Date) {
  const calendarDate = createUtcCalendarDate(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = calendarDate.getUTCDay();
  if (!Number.isFinite(weekday)) return { week: Number.NaN, year: Number.NaN };
  const weekStart = calendarDate.getTime() - weekday * MILLISECONDS_PER_DAY;
  const year = calendarDate.getUTCFullYear();
  const currentYearStart = defaultEnglishWeekYearStart(year);
  const nextYearStart = defaultEnglishWeekYearStart(year + 1);
  let weekYearStart = currentYearStart;
  let weekYear = year;
  if (weekStart < currentYearStart) {
    weekYearStart = defaultEnglishWeekYearStart(year - 1);
    weekYear = year - 1;
  } else if (weekStart >= nextYearStart) {
    weekYearStart = nextYearStart;
    weekYear = year + 1;
  }
  return {
    week: Math.floor((weekStart - weekYearStart) / (7 * MILLISECONDS_PER_DAY)) + 1,
    year: weekYear,
  };
}

export function formatNotesTemplateDate(now: Date, format: string) {
  const year = now.getFullYear();
  const calendarYear = padSigned(year, 4);
  const hour = now.getHours();
  const hour12 = hour % 12 || 12;
  const hour24 = hour === 0 ? 24 : hour;
  const meridiem = hour < 12 ? "AM" : "PM";
  const localizedTime = `${hour12}:${pad(now.getMinutes())} ${meridiem}`;
  const dayOfYear = localDayOfYear(now);
  const monthName = MONTH_NAMES[now.getMonth()] ?? "";
  const weekday = now.getDay();
  const weekdayName = WEEKDAY_NAMES[weekday] ?? "";
  const fractionalSeconds = pad(now.getMilliseconds(), 3);
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  const { week: localeWeek, year: localeWeekYear } = localDefaultEnglishCalendar(now);
  const { week: isoWeek, year: isoWeekYear } = localIsoCalendar(now);
  const unixMilliseconds = now.getTime();
  const eraAbbreviation = year <= 0 ? "BC" : "AD";
  const eraYear = year <= 0 ? 1 - year : year;
  const values = new Map<string, string>(Object.entries({
    YYYYYY: padSigned(year, 6, true),
    YYYYY: padSigned(year, 5),
    YYYY: calendarYear,
    YY: pad(year % 100),
    Y: year > 9_999 ? `+${year}` : calendarYear,
    yyyy: pad(eraYear, 4),
    yyy: pad(eraYear, 3),
    yy: pad(eraYear, 2),
    yo: formatEnglishOrdinal(eraYear),
    y: String(eraYear),
    NNNNN: eraAbbreviation,
    NNNN: year <= 0 ? "Before Christ" : "Anno Domini",
    NNN: eraAbbreviation,
    NN: eraAbbreviation,
    N: eraAbbreviation,
    LLLL: `${weekdayName}, ${monthName} ${now.getDate()}, ${calendarYear} ${localizedTime}`,
    LLL: `${monthName} ${now.getDate()}, ${calendarYear} ${localizedTime}`,
    LL: `${monthName} ${now.getDate()}, ${calendarYear}`,
    L: `${pad(now.getMonth() + 1)}/${pad(now.getDate())}/${calendarYear}`,
    LTS: `${hour12}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${meridiem}`,
    LT: localizedTime,
    llll: `${weekdayName.slice(0, 3)}, ${monthName.slice(0, 3)} ${now.getDate()}, ${calendarYear} ${localizedTime}`,
    lll: `${monthName.slice(0, 3)} ${now.getDate()}, ${calendarYear} ${localizedTime}`,
    ll: `${monthName.slice(0, 3)} ${now.getDate()}, ${calendarYear}`,
    l: `${now.getMonth() + 1}/${now.getDate()}/${calendarYear}`,
    MMMM: monthName,
    MMM: monthName.slice(0, 3),
    Mo: formatEnglishOrdinal(now.getMonth() + 1),
    MM: pad(now.getMonth() + 1),
    M: String(now.getMonth() + 1),
    DDDo: formatEnglishOrdinal(dayOfYear),
    DDDD: pad(dayOfYear, 3),
    DDD: String(dayOfYear),
    Do: formatEnglishOrdinal(now.getDate()),
    DD: pad(now.getDate()),
    D: String(now.getDate()),
    dddd: weekdayName,
    ddd: weekdayName.slice(0, 3),
    dd: weekdayName.slice(0, 2),
    do: formatEnglishOrdinal(weekday),
    d: String(weekday),
    e: String(weekday),
    E: String(weekday === 0 ? 7 : weekday),
    GGGGG: padSigned(isoWeekYear, 5),
    GGGG: String(isoWeekYear),
    GG: pad(isoWeekYear % 100),
    ggggg: padSigned(localeWeekYear, 5),
    gggg: String(localeWeekYear),
    gg: pad(localeWeekYear % 100),
    wo: formatEnglishOrdinal(localeWeek),
    ww: pad(localeWeek),
    w: String(localeWeek),
    Wo: formatEnglishOrdinal(isoWeek),
    WW: pad(isoWeek),
    W: String(isoWeek),
    HH: pad(hour),
    H: String(hour),
    kk: pad(hour24),
    k: String(hour24),
    hh: pad(hour12),
    h: String(hour12),
    mm: pad(now.getMinutes()),
    m: String(now.getMinutes()),
    ss: pad(now.getSeconds()),
    s: String(now.getSeconds()),
    A: meridiem,
    a: meridiem.toLowerCase(),
    Qo: formatEnglishOrdinal(quarter),
    Q: String(quarter),
    Z: formatTimezoneOffset(now, ":"),
    ZZ: formatTimezoneOffset(now, ""),
    zz: "",
    z: "",
    X: String(Math.floor(unixMilliseconds / 1_000)),
    x: String(unixMilliseconds),
  }));
  return format.replace(/\[([^\]]*)\]|YYYYYY|YYYYY|YYYY|YY|Y|yyyy|yyy|yy|yo|y|NNNNN|NNNN|NNN|NN|N|GGGGG|GGGG|GG|ggggg|gggg|gg|LTS|LT|LLLL|LLL|LL|L|llll|lll|ll|l|MMMM|MMM|Mo|MM|M|DDDo|DDDD|DDD|Do|DD|D|dddd|ddd|dd|do|d|HH|H|kk|k|hh|h|mm|m|ss|s|S{1,9}|A|a|ZZ|Z|zz|z|Qo|Q|e|E|wo|ww|w|Wo|WW|W|X|x/gu, (token, literal?: string) => {
    if (literal !== undefined) return literal;
    if (token.startsWith("S")) return fractionalSeconds.slice(0, token.length).padEnd(token.length, "0");
    return values.get(token) ?? token;
  });
}
