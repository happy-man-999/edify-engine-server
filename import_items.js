import mongoose from 'mongoose';
import fs from 'fs';
import Item from './models/Item.js';
import dotenv from 'dotenv';

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/edifyengine')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

async function importItems() {
  try {
    // Read the JSON file
    const itemsData = JSON.parse(fs.readFileSync('./store_items_data.json', 'utf8'));
    
    console.log(`Found ${itemsData.length} items to import`);
    
    // Clear existing items (optional - remove this if you want to keep existing items)
    // await Item.deleteMany({});
    // console.log('Cleared existing items');
    
    // Import items
    const results = [];
    for (const itemData of itemsData) {
      try {
        // Check if item already exists by title
        const existingItem = await Item.findOne({ title: itemData.title });
        
        if (existingItem) {
          console.log(`Item "${itemData.title}" already exists, skipping...`);
          continue;
        }
        
        const item = new Item(itemData);
        await item.save();
        results.push(item);
        console.log(`✅ Imported: ${itemData.title}`);
      } catch (error) {
        console.error(`❌ Failed to import "${itemData.title}":`, error.message);
      }
    }
    
    console.log(`\n🎉 Import completed!`);
    console.log(`Successfully imported: ${results.length} items`);
    console.log(`Failed: ${itemsData.length - results.length} items`);
    
    // Display summary by type
    const summary = {};
    results.forEach(item => {
      summary[item.type] = (summary[item.type] || 0) + 1;
    });
    
    console.log('\n📊 Summary by type:');
    Object.entries(summary).forEach(([type, count]) => {
      console.log(`  ${type}: ${count} items`);
    });
    
  } catch (error) {
    console.error('Import failed:', error);
  } finally {
    mongoose.connection.close();
    console.log('\n🔌 MongoDB connection closed');
  }
}

// Run the import
importItems(); 