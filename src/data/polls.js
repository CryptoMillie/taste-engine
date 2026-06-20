/**
 * Curated trending poll matchups.
 * Each poll pits two iconic items against each other across popular debate categories.
 * Images sourced from Wikimedia Commons (CC-licensed).
 */
export const POLLS = [
  // — Sports —
  {
    id: "poll-jordan-lebron",
    category: "Sports",
    label: "The GOAT debate",
    itemA: { id: "michael-jordan", name: "Michael Jordan", sub: "6× NBA CHAMPION", cat: "sports", img: "https://upload.wikimedia.org/wikipedia/commons/a/ae/Michael_Jordan_in_2014.jpg" },
    itemB: { id: "lebron-james", name: "LeBron James", sub: "AMERICAN BASKETBALL PLAYER", cat: "sports", img: "https://upload.wikimedia.org/wikipedia/commons/7/7a/LeBron_James_%2851959977144%29_%28cropped2%29.jpg" },
  },
  {
    id: "poll-messi-ronaldo",
    category: "Sports",
    label: "Football's eternal rivalry",
    itemA: { id: "lionel-messi", name: "Lionel Messi", sub: "ARGENTINE FOOTBALLER", cat: "sports", img: "https://upload.wikimedia.org/wikipedia/commons/6/6b/Lionel_Messi_White_House_2026_%283x4_cropped%29.jpg" },
    itemB: { id: "cristiano-ronaldo", name: "Cristiano Ronaldo", sub: "PORTUGUESE FOOTBALLER", cat: "sports", img: "https://upload.wikimedia.org/wikipedia/commons/8/8c/Cristiano_Ronaldo_2018.jpg" },
  },
  {
    id: "poll-brady-montana",
    category: "Sports",
    label: "NFL quarterback GOAT",
    itemA: { id: "tom-brady", name: "Tom Brady", sub: "7× SUPER BOWL CHAMPION", cat: "sports", img: "https://upload.wikimedia.org/wikipedia/commons/4/48/Tom_Brady_2017.jpg" },
    itemB: { id: "joe-montana", name: "Joe Montana", sub: "4× SUPER BOWL CHAMPION", cat: "sports", img: "https://upload.wikimedia.org/wikipedia/commons/0/09/Joe_Montana_at_rally%2C_January_2020_%28cropped%29.jpg" },
  },

  // — Food —
  {
    id: "poll-pizza-nuggets",
    category: "Food",
    label: "Ultimate comfort food",
    itemA: { id: "pizza", name: "Pizza", sub: "ITALIAN DISH", cat: "food", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Pizza-3007395.jpg/3840px-Pizza-3007395.jpg" },
    itemB: { id: "chicken-nuggets", name: "Chicken Nuggets", sub: "BREADED CHICKEN PIECES", cat: "food", img: "https://upload.wikimedia.org/wikipedia/commons/a/a6/Chicken_Nuggets.jpg" },
  },
  {
    id: "poll-sushi-tacos",
    category: "Food",
    label: "Best handheld meal",
    itemA: { id: "sushi", name: "Sushi", sub: "JAPANESE DISH", cat: "food", img: "https://upload.wikimedia.org/wikipedia/commons/6/60/Sushi_platter.jpg" },
    itemB: { id: "taco", name: "Tacos", sub: "MEXICAN DISH", cat: "food", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/73/001_Tacos_de_carnitas%2C_carne_asada_y_al_pastor.jpg/3840px-001_Tacos_de_carnitas%2C_carne_asada_y_al_pastor.jpg" },
  },
  {
    id: "poll-chocolate-icecream",
    category: "Food",
    label: "Sweet tooth showdown",
    itemA: { id: "chocolate", name: "Chocolate", sub: "COCOA-BASED SWEET", cat: "food", img: "https://upload.wikimedia.org/wikipedia/commons/7/70/Chocolate_%28blue_background%29.jpg" },
    itemB: { id: "ice-cream", name: "Ice Cream", sub: "FROZEN DAIRY DESSERT", cat: "food", img: "https://upload.wikimedia.org/wikipedia/commons/2/2e/Ice_cream_with_whipped_cream%2C_chocolate_sauce_and_a_wafer.jpg" },
  },
  {
    id: "poll-coffee-tea",
    category: "Food",
    label: "Morning ritual",
    itemA: { id: "coffee", name: "Coffee", sub: "BREWED BEVERAGE", cat: "food", img: "https://upload.wikimedia.org/wikipedia/commons/4/45/A_small_cup_of_coffee.JPG" },
    itemB: { id: "tea", name: "Tea", sub: "STEEPED BEVERAGE", cat: "food", img: "https://upload.wikimedia.org/wikipedia/commons/f/f7/Cup_of_tea_%28Bancha%29.jpg" },
  },

  // — Tech —
  {
    id: "poll-iphone-android",
    category: "Tech",
    label: "The phone war",
    itemA: { id: "iphone", name: "iPhone", sub: "APPLE SMARTPHONE", cat: "tech", img: "https://upload.wikimedia.org/wikipedia/commons/8/8d/IPhone_16_Pro_Vector.svg" },
    itemB: { id: "android", name: "Android", sub: "GOOGLE MOBILE OS", cat: "tech", img: "https://upload.wikimedia.org/wikipedia/commons/d/d7/Android_robot.svg" },
  },
  {
    id: "poll-playstation-xbox",
    category: "Tech",
    label: "Console wars",
    itemA: { id: "playstation", name: "PlayStation", sub: "SONY GAMING CONSOLE", cat: "tech", img: "https://upload.wikimedia.org/wikipedia/commons/0/00/PlayStation_logo.svg" },
    itemB: { id: "xbox", name: "Xbox", sub: "MICROSOFT GAMING CONSOLE", cat: "tech", img: "https://upload.wikimedia.org/wikipedia/commons/8/8c/XBOX_logo_2012.svg" },
  },
  {
    id: "poll-windows-mac",
    category: "Tech",
    label: "Desktop OS battle",
    itemA: { id: "windows", name: "Windows", sub: "MICROSOFT OS", cat: "tech", img: "https://upload.wikimedia.org/wikipedia/commons/8/87/Windows_logo_-_2021.svg" },
    itemB: { id: "macos", name: "macOS", sub: "APPLE DESKTOP OS", cat: "tech", img: "https://upload.wikimedia.org/wikipedia/commons/2/21/MacOS_wordmark_%282017%29.svg" },
  },

  // — Culture —
  {
    id: "poll-einstein-newton",
    category: "Culture",
    label: "Greatest scientist ever",
    itemA: { id: "albert-einstein", name: "Albert Einstein", sub: "THEORETICAL PHYSICIST", cat: "culture", img: "https://upload.wikimedia.org/wikipedia/commons/d/d3/Albert_Einstein_Head.jpg" },
    itemB: { id: "isaac-newton", name: "Isaac Newton", sub: "MATHEMATICIAN & PHYSICIST", cat: "culture", img: "https://upload.wikimedia.org/wikipedia/commons/3/3b/Portrait_of_Sir_Isaac_Newton%2C_1689.jpg" },
  },
  {
    id: "poll-batman-superman",
    category: "Culture",
    label: "Who wins in a fight?",
    itemA: { id: "batman", name: "Batman", sub: "DC COMICS SUPERHERO", cat: "culture", img: "https://upload.wikimedia.org/wikipedia/en/1/17/Batman-BenAffleck.jpg" },
    itemB: { id: "superman", name: "Superman", sub: "DC COMICS SUPERHERO", cat: "culture", img: "https://upload.wikimedia.org/wikipedia/en/3/35/Supermanflying.png" },
  },
  {
    id: "poll-marvel-dc",
    category: "Culture",
    label: "Comic universe showdown",
    itemA: { id: "marvel", name: "Marvel", sub: "COMIC BOOK UNIVERSE", cat: "culture", img: "https://upload.wikimedia.org/wikipedia/commons/b/b9/Marvel_Logo.svg" },
    itemB: { id: "dc-comics", name: "DC", sub: "COMIC BOOK UNIVERSE", cat: "culture", img: "https://upload.wikimedia.org/wikipedia/commons/3/3d/DC_Comics_logo.svg" },
  },
  {
    id: "poll-swift-beyonce",
    category: "Culture",
    label: "Pop queen crown",
    itemA: { id: "taylor-swift", name: "Taylor Swift", sub: "SINGER-SONGWRITER", cat: "culture", img: "https://upload.wikimedia.org/wikipedia/commons/b/b1/Taylor_Swift_at_the_2023_MTV_Video_Music_Awards_%283%29.png" },
    itemB: { id: "beyonce", name: "Beyoncé", sub: "SINGER & PERFORMER", cat: "culture", img: "https://upload.wikimedia.org/wikipedia/commons/1/17/Beyonc%C3%A9_at_The_Eras_Tour_in_Madrid_2.jpg" },
  },

  // — Animals —
  {
    id: "poll-dog-cat",
    category: "Animals",
    label: "The eternal pet debate",
    itemA: { id: "dog", name: "Dog", sub: "DOMESTICATED CANID", cat: "animals", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Huskiesatrest.jpg/3840px-Huskiesatrest.jpg" },
    itemB: { id: "cat", name: "Cat", sub: "DOMESTICATED CARNIVORE", cat: "animals", img: "https://upload.wikimedia.org/wikipedia/commons/1/15/Cat_August_2010-4.jpg" },
  },
  {
    id: "poll-shark-lion",
    category: "Animals",
    label: "Apex predator face-off",
    itemA: { id: "great-white-shark", name: "Great White Shark", sub: "OCEAN APEX PREDATOR", cat: "animals", img: "https://upload.wikimedia.org/wikipedia/commons/5/56/White_shark.jpg" },
    itemB: { id: "lion", name: "Lion", sub: "KING OF THE JUNGLE", cat: "animals", img: "https://upload.wikimedia.org/wikipedia/commons/7/73/Lion_waiting_in_Namibia.jpg" },
  },
  {
    id: "poll-eagle-wolf",
    category: "Animals",
    label: "Spirit animal pick",
    itemA: { id: "bald-eagle", name: "Bald Eagle", sub: "BIRD OF PREY", cat: "animals", img: "https://upload.wikimedia.org/wikipedia/commons/1/1a/About_to_Launch_%2826075320352%29.jpg" },
    itemB: { id: "wolf", name: "Wolf", sub: "WILD CANID", cat: "animals", img: "https://upload.wikimedia.org/wikipedia/commons/6/68/Eurasian_wolf_2.jpg" },
  },

  // — Cars —
  {
    id: "poll-honda-toyota",
    category: "Cars",
    label: "Reliability king",
    itemA: { id: "honda", name: "Honda", sub: "JAPANESE AUTOMAKER", cat: "cars", img: "https://upload.wikimedia.org/wikipedia/commons/3/38/Honda_Civic_Sedan_%28XI%29_1X7A0473.jpg" },
    itemB: { id: "toyota", name: "Toyota", sub: "JAPANESE AUTOMAKER", cat: "cars", img: "https://upload.wikimedia.org/wikipedia/commons/9/9d/2019_Toyota_Corolla_Hybrid_1.8.jpg" },
  },
  {
    id: "poll-lambo-ferrari",
    category: "Cars",
    label: "Dream car duel",
    itemA: { id: "lamborghini", name: "Lamborghini", sub: "ITALIAN SUPERCAR BRAND", cat: "cars", img: "https://upload.wikimedia.org/wikipedia/commons/e/ed/Lamborghini_Aventador_S_%2844554%29.jpg" },
    itemB: { id: "ferrari", name: "Ferrari", sub: "ITALIAN SPORTS CAR BRAND", cat: "cars", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/LaFerrari_in_Beverly_Hills_%2814563979888%29.jpg/3840px-LaFerrari_in_Beverly_Hills_%2814563979888%29.jpg" },
  },
  {
    id: "poll-tesla-porsche",
    category: "Cars",
    label: "Future vs heritage",
    itemA: { id: "tesla", name: "Tesla", sub: "ELECTRIC VEHICLE MAKER", cat: "cars", img: "https://upload.wikimedia.org/wikipedia/commons/9/91/2019_Tesla_Model_3_Performance_AWD_Front.jpg" },
    itemB: { id: "porsche-brand", name: "Porsche", sub: "GERMAN SPORTS CAR BRAND", cat: "cars", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Porsche_911_No_1000000%2C_70_Years_Porsche_Sports_Car%2C_Berlin_%281X7A3888%29.jpg/3840px-Porsche_911_No_1000000%2C_70_Years_Porsche_Sports_Car%2C_Berlin_%281X7A3888%29.jpg" },
  },
];

export const POLL_CATEGORIES = ["All", "Sports", "Food", "Tech", "Culture", "Animals", "Cars"];
