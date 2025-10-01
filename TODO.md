# TODO List

## ✅ Completed Tasks

### Similarity Clustering System
- [x] **Implement clustering algorithm for grouping similar questions**
  - Connected components algorithm to group similar questions
  - Configurable similarity thresholds and cluster metrics
  - Support for splitting and merging clusters

- [x] **Add database schema for questionClusters collection**
  - New `questionClusters` collection with status tracking
  - Cluster metadata (similarity scores, timestamps, status)
  - Integration with existing MongoDB setup

- [x] **Add API endpoints for cluster operations**
  - `GET/POST /api/exams/[examId]/dedupe/clusters` - Generate and retrieve clusters
  - `GET/POST/DELETE /api/exams/[examId]/dedupe/clusters/[clusterId]` - Manage individual clusters
  - Support for cluster actions (approve, exclude, split, reset)

- [x] **Create new cluster view UI component for the dedupe page**
  - New "Similarity Groups" tab in dedupe interface
  - Expandable cluster cards showing all questions in groups
  - Visual status indicators and question previews

- [x] **Implement cluster management features (split, merge, exclude)**
  - Bulk actions: "Keep as Variants", "Mark as Duplicates"
  - Individual question exclusion from clusters
  - Cluster status management and audit trail

- [x] **Test the clustering functionality with real data**
  - Successfully generated 34 clusters from sitecore-xmc exam
  - Verified API endpoints and UI functionality
  - Confirmed vector similarity processing works correctly

## 📋 Pending Tasks

### Performance & User Experience
- [ ] **Implement background processor for cluster generation to avoid UI timeouts**
  - Create job queue system using MongoDB
  - Background worker script for processing cluster jobs
  - Real-time progress updates and status tracking
  - Non-blocking UI with polling for job completion
  - Support for multiple concurrent clustering jobs

### Environment Configuration
- [ ] **Add MONGODB_QUESTION_CLUSTERS_COLLECTION to .env.example**
  - Document the new environment variable for cluster storage
  - Update configuration documentation
  - Ensure proper setup instructions for new deployments

## 🎯 Future Enhancements

### Clustering Improvements
- [ ] **Advanced cluster splitting algorithms**
  - Implement automatic cluster splitting based on sub-similarity thresholds
  - Manual cluster editing and reorganization tools

- [ ] **Cluster quality metrics**
  - Add coherence scoring for cluster quality assessment
  - Cluster validation and recommendation system

### Exam Management
- [ ] **Exam constraint enforcement**
  - Prevent similar questions from appearing on same exam
  - Warning system for potential duplicates during exam generation
  - Automatic question substitution from different clusters

### Analytics & Reporting
- [ ] **Clustering analytics dashboard**
  - Cluster distribution statistics
  - Duplicate detection efficiency metrics
  - Historical clustering trends

---

## Notes

### Current System Status
- ✅ Clustering system fully functional
- ✅ UI provides comprehensive cluster management
- ⚠️ Cluster generation takes 60+ seconds (needs background processing)

### Key Features Delivered
- **Smart Question Grouping**: Automatically clusters similar questions using vector embeddings
- **Batch Decision Making**: Review entire groups instead of individual pairs
- **Flexible Management**: Exclude questions, approve variants, or mark duplicates
- **Visual Interface**: Expandable cards with full question content and actions