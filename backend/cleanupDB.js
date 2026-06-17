/**
 * ── DB Cleanup Script ─────────────────────────────────────────
 * Run this ONCE to clean existing data in MongoDB
 * Command: node cleanupDB.js
 *
 * What it does:
 * 1. Removes resumeText field from all candidates
 * 2. Truncates long text fields
 * 3. Removes duplicate candidates (same email + jobId)
 * 4. Removes rejected candidates older than 6 months
 * 5. Shows before/after storage estimate
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

async function cleanup() {
  console.log('🔗 Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected!\n');

  const db = mongoose.connection.db;
  const collection = db.collection('candidates');

  // ── Count before ─────────────────────────────────────────────
  const totalBefore = await collection.countDocuments();
  console.log(`📊 Total candidates before cleanup: ${totalBefore}`);

  // ── Step 1: Remove resumeText field from ALL documents ───────
  console.log('\n🧹 Step 1: Removing resumeText field...');
  const step1 = await collection.updateMany(
    { resumeText: { $exists: true } },
    { $unset: { resumeText: "" } }
  );
  console.log(`   ✅ Removed resumeText from ${step1.modifiedCount} candidates`);

  // ── Step 2: Remove other large unused fields ──────────────────
  console.log('\n🧹 Step 2: Removing other large unused fields...');
  const step2 = await collection.updateMany(
    {},
    {
      $unset: {
        rawText:        "",
        fullText:       "",
        parsedText:     "",
        resume_text:    "",
        cv_text:        "",
        extractedText:  "",
        fileData:       "",
        fileBuffer:     "",
        pdfData:        "",
      }
    }
  );
  console.log(`   ✅ Cleaned large fields from ${step2.modifiedCount} candidates`);

  // ── Step 3: Truncate long text fields ────────────────────────
  console.log('\n🧹 Step 3: Truncating overly long text fields...');
  const allCandidates = await collection.find({}).toArray();
  let truncated = 0;

  for (const c of allCandidates) {
    const updates = {};
    if (c.summary?.length > 500)              updates.summary              = c.summary.slice(0, 500);
    if (c.technicalExperience?.length > 300)  updates.technicalExperience  = c.technicalExperience.slice(0, 300);
    if (c.leadershipExperience?.length > 300) updates.leadershipExperience = c.leadershipExperience.slice(0, 300);
    if (c.cloudExpertise?.length > 300)       updates.cloudExpertise       = c.cloudExpertise.slice(0, 300);
    if (c.recommendationReason?.length > 300) updates.recommendationReason = c.recommendationReason.slice(0, 300);
    if (c.topSkills?.length > 15)             updates.topSkills            = c.topSkills.slice(0, 15);
    if (c.strengths?.length > 5)              updates.strengths            = c.strengths.slice(0, 5);
    if (c.gaps?.length > 5)                   updates.gaps                 = c.gaps.slice(0, 5);
    if (c.databases?.length > 10)             updates.databases            = c.databases.slice(0, 10);
    if (c.frameworks?.length > 10)            updates.frameworks           = c.frameworks.slice(0, 10);
    if (c.tools?.length > 10)                 updates.tools                = c.tools.slice(0, 10);

    if (Object.keys(updates).length > 0) {
      await collection.updateOne({ _id: c._id }, { $set: updates });
      truncated++;
    }
  }
  console.log(`   ✅ Truncated fields in ${truncated} candidates`);

  // ── Step 4: Remove rejected candidates older than 6 months ───
  console.log('\n🧹 Step 4: Removing old rejected candidates (6+ months)...');
  const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);
  const step4 = await collection.deleteMany({
    status:    'rejected',
    createdAt: { $lt: sixMonthsAgo }
  });
  console.log(`   ✅ Removed ${step4.deletedCount} old rejected candidates`);

  // ── Step 5: Remove duplicate candidates (same email + jobId) ─
  console.log('\n🧹 Step 5: Removing duplicate candidates...');
  const pipeline = [
    { $group: {
      _id: { email: "$email", jobId: "$jobId" },
      ids: { $push: "$_id" },
      count: { $sum: 1 }
    }},
    { $match: { count: { $gt: 1 } }}
  ];
  const duplicates = await collection.aggregate(pipeline).toArray();
  let dupRemoved = 0;

  for (const dup of duplicates) {
    // Keep the first (oldest), remove the rest
    const toRemove = dup.ids.slice(1);
    await collection.deleteMany({ _id: { $in: toRemove } });
    dupRemoved += toRemove.length;
  }
  console.log(`   ✅ Removed ${dupRemoved} duplicate candidates`);

  // ── Step 6: Remove screening answers text if very long ───────
  console.log('\n🧹 Step 6: Trimming screening answers...');
  let answersTrimmed = 0;
  const withAnswers = await collection.find({ screeningAnswers: { $exists: true, $ne: [] } }).toArray();
  for (const c of withAnswers) {
    if (!c.screeningAnswers?.length) continue;
    const trimmed = c.screeningAnswers.map((a: any) => ({
      ...a,
      answer:     a.answer?.slice(0, 2000) || '',
      aiFeedback: a.aiFeedback?.slice(0, 500) || '',
    }));
    await collection.updateOne({ _id: c._id }, { $set: { screeningAnswers: trimmed } });
    answersTrimmed++;
  }
  console.log(`   ✅ Trimmed answers in ${answersTrimmed} candidates`);

  // ── Step 7: Run MongoDB compact (reclaim space) ───────────────
  console.log('\n🔧 Step 7: Running collection compact to reclaim disk space...');
  try {
    await db.command({ compact: 'candidates' });
    console.log('   ✅ Compact complete');
  } catch (e) {
    console.log('   ⚠️  Compact skipped (not supported on free tier Atlas — that is OK)');
  }

  // ── Final count ───────────────────────────────────────────────
  const totalAfter = await collection.countDocuments();
  console.log('\n' + '='.repeat(50));
  console.log('🎉 CLEANUP COMPLETE!');
  console.log('='.repeat(50));
  console.log(`📊 Candidates before: ${totalBefore}`);
  console.log(`📊 Candidates after:  ${totalAfter}`);
  console.log(`🗑️  Records removed:   ${totalBefore - totalAfter}`);
  console.log('\n✅ What was cleaned:');
  console.log('   • resumeText field removed (biggest saving)');
  console.log('   • Other large text fields removed');
  console.log('   • Long strings truncated');
  console.log('   • Old rejected candidates removed');
  console.log('   • Duplicate candidates removed');
  console.log('   • Screening answers trimmed');
  console.log('\n💡 Check MongoDB Atlas storage now — should be significantly reduced!');
  console.log('='.repeat(50));

  await mongoose.disconnect();
}

cleanup().catch(err => {
  console.error('❌ Cleanup failed:', err);
  process.exit(1);
});
