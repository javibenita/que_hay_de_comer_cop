const dateElement = document.querySelector("#today-date");
const mealTitle = document.querySelector("#meal-title");
const dinnerTitle = document.querySelector("#dinner-title");
const mealCard = document.querySelector("#meal-card");
const dinnerCard = document.querySelector("#dinner-card");
const mealIngredientList = document.querySelector("#meal-ingredient-list");
const dinnerIngredientList = document.querySelector("#dinner-ingredient-list");
const ingredientList = document.querySelector("#ingredient-list");
const ingredientCount = document.querySelector("#ingredient-count");
const sheetStatus = document.querySelector("#sheet-status");
const nextDayButton = document.querySelector("#next-day-button");
const futureDays = document.querySelector("#future-days");

const SPREADSHEET_ID = "1r-9gv9unPgfm7iiEfWHz4DMtuc_NyolIajzAgjkkbMI";
const SHEET_NAMES = {
  plan: "Plan",
  meal: "COMIDAS",
  dinner: "CENAS",
  side: "ACOMPS.CENA",
};

let sheetData = null;
let nextDayOffset = 1;

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleUpperCase("es-ES");
}

function parseDate(value) {
  const match = String(value).match(
    /(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/,
  );
  if (!match) {
    throw new Error("No se encontró la fecha inicial en Plan!B1.");
  }

  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function getRowsFromGoogleResponse(text) {
  const json = text
    .trim()
    .replace(/^\/\*O_o\*\/\s*/, "")
    .replace(/^\s*google\.visualization\.Query\.setResponse\(/, "")
    .replace(/\);?\s*$/, "");
  const response = JSON.parse(json);
  if (response.status !== "ok") {
    throw new Error(
      response.errors?.[0]?.detailed_message ||
        "Google Sheets devolvió un error.",
    );
  }

  return response.table.rows.map((row) =>
    row.c.map((cell) => (cell?.v == null ? "" : String(cell.v))),
  );
}

async function fetchSheet(sheetName) {
  const url = new URL(
    `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq`,
  );
  url.searchParams.set("tqx", "out:json");
  url.searchParams.set("sheet", sheetName);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `No se pudo leer la hoja ${sheetName} (${response.status}).`,
    );
  }

  return getRowsFromGoogleResponse(await response.text());
}

function getWorkdayColumns(planRows) {
  const firstRow = planRows[0] || [];
  const columns = [];
  for (let index = 1; index < firstRow.length; index += 1) {
    if (String(firstRow[index] || "").trim()) columns.push(index);
  }
  if (!columns.length)
    throw new Error("No hay días configurados desde Plan!B1.");
  return columns;
}

function getTodayColumn(planRows, today) {
  const firstDate = parseDate(planRows[0]?.[1]);
  const columns = getWorkdayColumns(planRows);
  const start = new Date(
    firstDate.getFullYear(),
    firstDate.getMonth(),
    firstDate.getDate(),
  );
  const target = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const daysSinceStart = Math.floor((target - start) / 86400000);
  const workdaysSinceStart =
    Math.floor(daysSinceStart / 7) * 5 + Math.min(daysSinceStart % 7, 5);
  return columns[
    ((workdaysSinceStart % columns.length) + columns.length) % columns.length
  ];
}

function createIngredientIndex(rows) {
  return new Map(
    rows.map((row) => [
      normalize(row[0]),
      {
        type: normalize(row[1]) || "OTROS",
        ingredients: row.slice(2).filter(Boolean),
      },
    ]),
  );
}

function applyCategoryStyle(card, primaryEntry, secondaryEntry = null) {
  const primaryCategory = primaryEntry?.type || "OTROS";
  const secondaryCategory = secondaryEntry?.type || null;
  const symbolByCategory = {
    CARNE: "🥩",
    PASTA: "🍝",
    ARROZ: "🍚",
    PESCADO: "🐟",
    LEGUMBRE: "🫘",
    VERDURA: "🥦",
    OTROS: "🍽️",
  };
  const colorByCategory = {
    CARNE: "#d99a83",
    PASTA: "#e5bd70",
    ARROZ: "#d8c7a5",
    PESCADO: "#8dbac1",
    LEGUMBRE: "#b1a27d",
    VERDURA: "#a9c2a4",
    OTROS: "#a7a9a6",
  };
  const categories = [primaryCategory, secondaryCategory].filter(Boolean);
  const categoryClass = primaryCategory.toLocaleLowerCase("es-ES");
  const badge = card.querySelector(".image-badge");
  const symbol = card.querySelector(".dish-symbol");
  card.dataset.category = categoryClass;
  card.style.setProperty(
    "--category-primary",
    colorByCategory[primaryCategory] || colorByCategory.OTROS,
  );
  card.style.setProperty(
    "--category-secondary",
    colorByCategory[secondaryCategory] ||
      colorByCategory[primaryCategory] ||
      colorByCategory.OTROS,
  );
  badge.textContent = [badge.dataset.mealType, ...categories].join(" · ");
  symbol.textContent = categories
    .map((category) => symbolByCategory[category] || "🍽️")
    .join(" ");
}

function uniqueIngredients(ingredientRows) {
  const seen = new Set();
  return ingredientRows
    .flatMap((row) => row)
    .filter((ingredient) => {
      const key = normalize(ingredient);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function renderIngredientList(list, ingredientRows) {
  const entries = uniqueIngredients(ingredientRows);
  list.replaceChildren(
    ...entries.map((ingredient) => {
      const item = document.createElement("li");
      item.textContent = ingredient;
      return item;
    }),
  );
  return entries;
}

function getMenuForDate(date, data) {
  const column = getTodayColumn(data.planRows, date);
  const meal = data.planRows[1]?.[column] || "Sin comida asignada";
  const dinner = data.planRows[2]?.[column] || "Sin cena asignada";
  const side = data.planRows[3]?.[column] || "";

  return {
    meal,
    dinner,
    side,
    mealEntry: data.mealIndex.get(normalize(meal)),
    dinnerEntry: data.dinnerIndex.get(normalize(dinner)),
    sideEntry: data.sideIndex.get(normalize(side)),
  };
}

function getMenuIngredients(menu) {
  const mealIngredients = uniqueIngredients([
    menu.mealEntry?.ingredients || [],
  ]);
  const dinnerIngredients = uniqueIngredients([
    menu.dinnerEntry?.ingredients || [],
    menu.sideEntry?.ingredients || [],
  ]);

  return { mealIngredients, dinnerIngredients };
}

function createDishCard({
  id,
  mealType,
  sectionLabel,
  title,
  entry,
  secondaryEntry,
  ingredients,
}) {
  const card = document.createElement("article");
  card.className = "dish-card";
  if (mealType === "Cena") card.classList.add("dinner-card");
  card.id = id;

  const image = document.createElement("div");
  image.className = "dish-image";
  image.setAttribute("role", "img");
  image.setAttribute("aria-label", `${mealType} de hoy`);

  const badge = document.createElement("span");
  badge.className = "image-badge";
  badge.dataset.mealType = mealType;
  badge.textContent = mealType;
  image.append(badge);

  const symbol = document.createElement("span");
  symbol.className = "dish-symbol";
  symbol.setAttribute("aria-hidden", "true");
  symbol.textContent = "🍽️";
  image.append(symbol);

  const content = document.createElement("div");
  content.className = "dish-content";

  const heading = document.createElement("div");
  heading.className = "dish-heading";
  const headingText = document.createElement("div");
  const label = document.createElement("p");
  label.className = "section-label";
  label.textContent = sectionLabel;
  const titleElement = document.createElement("h2");
  titleElement.id = `${id}-title`;
  titleElement.textContent = title;
  headingText.append(label, titleElement);
  heading.append(headingText);

  const ingredientsBlock = document.createElement("div");
  ingredientsBlock.className = "card-ingredients";
  const ingredientsLabel = document.createElement("p");
  ingredientsLabel.className = "section-label";
  ingredientsLabel.textContent = `Ingredientes de ${mealType.toLocaleLowerCase("es-ES")}`;
  const list = document.createElement("ul");
  list.className = "dish-ingredient-list";
  renderIngredientList(list, [ingredients]);
  ingredientsBlock.append(ingredientsLabel, list);

  content.append(heading, ingredientsBlock);
  card.append(image, content);
  applyCategoryStyle(card, entry, secondaryEntry);
  return card;
}

function formatDayHeading(date) {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function isWeekend(date) {
  return date.getDay() === 0 || date.getDay() === 6;
}

function createWeekendSection(date, offset) {
  const section = document.createElement("section");
  section.className = "future-day weekend-day";
  section.setAttribute("aria-labelledby", `future-day-${offset}`);

  const header = document.createElement("header");
  header.className = "future-day-header";
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Pausa en el menú";
  const title = document.createElement("h2");
  title.id = `future-day-${offset}`;
  title.textContent = formatDayHeading(date);
  header.append(eyebrow, title);

  const message = document.createElement("div");
  message.className = "weekend-message";
  const icon = document.createElement("span");
  icon.className = "weekend-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "🎉";
  const messageText = document.createElement("p");
  messageText.textContent = "Fin de semana";
  const messageNote = document.createElement("span");
  messageNote.textContent = "El menú continúa el lunes.";
  message.append(icon, messageText, messageNote);

  const nextButton = document.createElement("button");
  nextButton.className = "next-day-button";
  nextButton.type = "button";
  nextButton.textContent = "¿Y el lunes?";
  nextButton.addEventListener("click", () => appendNextDay(nextButton));
  section.append(header, message, nextButton);
  return section;
}

function createFutureDaySection(date, menu, offset) {
  const section = document.createElement("section");
  section.className = "future-day";
  section.setAttribute("aria-labelledby", `future-day-${offset}`);

  const header = document.createElement("header");
  header.className = "future-day-header";
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Próximo menú";
  const title = document.createElement("h2");
  title.id = `future-day-${offset}`;
  title.textContent = formatDayHeading(date);
  header.append(eyebrow, title);

  const layout = document.createElement("div");
  layout.className = "dish-layout";
  const ingredients = getMenuIngredients(menu);
  const dinnerTitle = menu.side ? `${menu.dinner} + ${menu.side}` : menu.dinner;
  const mealCard = createDishCard({
    id: `future-meal-${offset}`,
    mealType: "Comida",
    sectionLabel: "Plato principal",
    title: menu.meal,
    entry: menu.mealEntry,
    ingredients: ingredients.mealIngredients,
  });
  const dinnerCard = createDishCard({
    id: `future-dinner-${offset}`,
    mealType: "Cena",
    sectionLabel: "Plato principal + acompañamiento",
    title: dinnerTitle,
    entry: menu.dinnerEntry,
    secondaryEntry: menu.sideEntry,
    ingredients: ingredients.dinnerIngredients,
  });

  const panel = document.createElement("aside");
  panel.className = "ingredients-panel";
  const panelHeading = document.createElement("div");
  panelHeading.className = "panel-heading";
  const panelTitle = document.createElement("h2");
  panelTitle.textContent = "Ingredientes";
  panelHeading.append(panelTitle);
  const count = document.createElement("span");
  count.className = "ingredient-count";
  panelHeading.append(count);
  const list = document.createElement("ul");
  list.className = "ingredient-list";
  const allIngredients = renderIngredientList(list, [
    ingredients.mealIngredients,
    ingredients.dinnerIngredients,
  ]);
  count.textContent = allIngredients.length;
  panel.append(panelHeading, list);

  layout.append(mealCard, dinnerCard, panel);
  const nextButton = document.createElement("button");
  nextButton.className = "next-day-button";
  nextButton.type = "button";
  nextButton.textContent = offset === 1 ? "¿Y pasado?" : "¿Y el otro?";
  nextButton.addEventListener("click", () => appendNextDay(nextButton));
  section.append(header, layout, nextButton);
  return section;
}

function appendNextDay(buttonToHide = nextDayButton) {
  if (!sheetData) return;
  const date = new Date();
  date.setDate(date.getDate() + nextDayOffset);
  if (isWeekend(date)) {
    futureDays.append(createWeekendSection(date, nextDayOffset));
    nextDayOffset += date.getDay() === 6 ? 2 : 1;
    buttonToHide.hidden = true;
    return;
  }

  const menu = getMenuForDate(date, sheetData);
  futureDays.append(createFutureDaySection(date, menu, nextDayOffset));
  nextDayOffset += 1;
  buttonToHide.hidden = true;
}

async function loadTodayMenu() {
  try {
    const [planRows, mealRows, dinnerRows, sideRows] = await Promise.all([
      fetchSheet(SHEET_NAMES.plan),
      fetchSheet(SHEET_NAMES.meal),
      fetchSheet(SHEET_NAMES.dinner),
      fetchSheet(SHEET_NAMES.side),
    ]);
    sheetData = {
      planRows,
      mealIndex: createIngredientIndex(mealRows),
      dinnerIndex: createIngredientIndex(dinnerRows),
      sideIndex: createIngredientIndex(sideRows),
    };
    const menu = getMenuForDate(new Date(), sheetData);
    const { meal, dinner, side, mealEntry, dinnerEntry, sideEntry } = menu;
    const { mealIngredients, dinnerIngredients } = getMenuIngredients(menu);

    mealTitle.textContent = meal;
    dinnerTitle.textContent = side ? `${dinner} + ${side}` : dinner;
    applyCategoryStyle(mealCard, mealEntry);
    applyCategoryStyle(dinnerCard, dinnerEntry, sideEntry);
    renderIngredientList(mealIngredientList, [mealIngredients]);
    renderIngredientList(dinnerIngredientList, [dinnerIngredients]);
    const allIngredients = renderIngredientList(ingredientList, [
      mealIngredients,
      dinnerIngredients,
    ]);
    ingredientCount.textContent = allIngredients.length;
    nextDayButton.disabled = false;
    sheetStatus.textContent = "";
  } catch (error) {
    sheetStatus.textContent = `No se pudo cargar el menú: ${error.message}`;
    console.error(error);
  }
}

dateElement.textContent = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
}).format(new Date());
loadTodayMenu();
nextDayButton.addEventListener("click", () => appendNextDay(nextDayButton));
