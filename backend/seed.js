// Run this once to create admin: node seed.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const existing = await User.findOne({ email: 'admin@recruitiq.com' });
  if (existing) {
    console.log('Admin already exists. Deleting and recreating...');
    await User.deleteOne({ email: 'admin@recruitiq.com' });
  }

  await User.create({
    name: 'Admin',
    email: 'admin@recruitiq.com',
    password: 'Admin@1234',
    role: 'admin',
    isActive: true,
  });

  console.log('\n✅ Admin account created!');
  console.log('   Email:    admin@recruitiq.com');
  console.log('   Password: Admin@1234');
  console.log('\nChange your password after first login.\n');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
