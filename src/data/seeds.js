/**
 * Seed data — fallback deck when no trending fetch is available.
 * Images are from Wikimedia Commons (CC-licensed).
 * In production, fetchTrending() supplements/replaces this list daily.
 */
export const SEED_ITEMS = [
  { name: "Victor Wembanyama", sub: "FRENCH BASKETBALL PLAYER", cat: "trending", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/Victor_Wembanyama_San_Antonio_Spurs_2024.jpg/1280px-Victor_Wembanyama_San_Antonio_Spurs_2024.jpg" },
  { name: "Jalen Brunson", sub: "AMERICAN BASKETBALL PLAYER", cat: "trending", img: "https://upload.wikimedia.org/wikipedia/commons/f/f2/Jalen_Brunson_2023_%28cropped%29.jpg" },
  { name: "LeBron James", sub: "AMERICAN BASKETBALL PLAYER", cat: "trending", img: "https://upload.wikimedia.org/wikipedia/commons/7/7a/LeBron_James_%2851959977144%29_%28cropped2%29.jpg" },
  { name: "Lionel Messi", sub: "ARGENTINE FOOTBALLER", cat: "trending", img: "https://upload.wikimedia.org/wikipedia/commons/6/6b/Lionel_Messi_White_House_2026_%283x4_cropped%29.jpg" },
  { name: "Stephen Curry", sub: "AMERICAN BASKETBALL PLAYER", cat: "trending", img: "https://upload.wikimedia.org/wikipedia/commons/5/52/Stephen_Curry%2C_Olympic_Games_2024_%28cropped%29.jpg" },
  { name: "Taylor Swift", sub: "SINGER-SONGWRITER", cat: "music", img: "https://upload.wikimedia.org/wikipedia/commons/b/b1/Taylor_Swift_at_the_2023_MTV_Video_Music_Awards_%283%29.png" },
  { name: "Kendrick Lamar", sub: "RAPPER & SONGWRITER", cat: "music", img: "https://upload.wikimedia.org/wikipedia/commons/1/18/KendrickSZASPurs230725-144_%28cropped%29_desaturated.jpg" },
  { name: "Billie Eilish", sub: "SINGER-SONGWRITER", cat: "music", img: "https://upload.wikimedia.org/wikipedia/commons/c/c7/BillieEilishO2140725-39_-_54665577407_%28cropped%29.jpg" },
  { name: "Cat", sub: "DOMESTICATED CARNIVORE", cat: "animals", img: "https://upload.wikimedia.org/wikipedia/commons/1/15/Cat_August_2010-4.jpg" },
  { name: "Dog", sub: "DOMESTICATED CANID", cat: "animals", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Huskiesatrest.jpg/3840px-Huskiesatrest.jpg" },
  { name: "Red Panda", sub: "MAMMAL OF ASIA", cat: "animals", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Red_Panda%2C_Gentle_Tree-Dweller_of_the_Himalayas.jpg/3840px-Red_Panda%2C_Gentle_Tree-Dweller_of_the_Himalayas.jpg" },
  { name: "Axolotl", sub: "SPECIES OF SALAMANDER", cat: "animals", img: "https://upload.wikimedia.org/wikipedia/commons/0/00/Axolotl_ganz.jpg" },
  { name: "Capybara", sub: "LARGEST RODENT", cat: "animals", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/Capybaracropped.jpg/3840px-Capybaracropped.jpg" },
  { name: "Lamborghini Aventador", sub: "ITALIAN SUPERCAR", cat: "cars", img: "https://upload.wikimedia.org/wikipedia/commons/e/ed/Lamborghini_Aventador_S_%2844554%29.jpg" },
  { name: "LaFerrari", sub: "ITALIAN HYPERCAR", cat: "cars", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/LaFerrari_in_Beverly_Hills_%2814563979888%29.jpg/3840px-LaFerrari_in_Beverly_Hills_%2814563979888%29.jpg" },
  { name: "Bugatti Chiron", sub: "FRENCH HYPERCAR", cat: "cars", img: "https://upload.wikimedia.org/wikipedia/commons/1/18/Bugatti_Chiron_1.jpg" },
  { name: "Porsche 911", sub: "GERMAN SPORTS CAR", cat: "cars", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Porsche_911_No_1000000%2C_70_Years_Porsche_Sports_Car%2C_Berlin_%281X7A3888%29.jpg/3840px-Porsche_911_No_1000000%2C_70_Years_Porsche_Sports_Car%2C_Berlin_%281X7A3888%29.jpg" },
  { name: "Pizza", sub: "ITALIAN DISH", cat: "food", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Pizza-3007395.jpg/3840px-Pizza-3007395.jpg" },
  { name: "Sushi", sub: "JAPANESE DISH", cat: "food", img: "https://upload.wikimedia.org/wikipedia/commons/6/60/Sushi_platter.jpg" },
  { name: "Taco", sub: "MEXICAN DISH", cat: "food", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/73/001_Tacos_de_carnitas%2C_carne_asada_y_al_pastor.jpg/3840px-001_Tacos_de_carnitas%2C_carne_asada_y_al_pastor.jpg" },
];
