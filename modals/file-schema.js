import mongoose from "mongoose";

const fileSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  messageId: {
    type: String,
    required: true,
    unique: true,
  },
  chunkIndex: {
    type: Number,
    default: null,
  },
  channelId: {
    type: String,
    required: true,
  },
  isFolder: {
    type: Boolean,
    default: false,
  },
  folderId: {
    type: String,
    default: null,
  },
  attachments: [],
});

export default mongoose.model("File", fileSchema, "files");
